
-- sql/rpc_process_sale.sql
-- RPC transaccional para descontar stock FINAL (FIFO), insertar movimientos y sales_processed.
-- Simplificada, SECURITY DEFINER (usar con service_key desde backend).

CREATE OR REPLACE FUNCTION public.fn_process_sale (
  p_remito text,
  p_client text,
  p_user   text,
  p_lines  jsonb   -- [{line_id, item_code, brand_id, style_id, label_name, qty, uom}]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_now timestamptz := now();
  v_processed int := 0;
  v_err text;
  v_line jsonb;
  v_need int;
  v_brand text; v_style text; v_label text; v_code text; v_line_id text; v_uom text;
  v_avail int;
BEGIN
  IF p_remito IS NULL OR p_lines IS NULL THEN
    RAISE EXCEPTION 'missing params';
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_line_id := COALESCE(v_line->>'line_id','');
    v_code    := COALESCE(v_line->>'item_code','');
    v_brand   := COALESCE(v_line->>'brand_id','');
    v_style   := COALESCE(v_line->>'style_id','');
    v_label   := COALESCE(v_line->>'label_name','');
    v_uom     := COALESCE(v_line->>'uom','lata 473cc');
    v_need    := COALESCE((v_line->>'qty')::int,0);

    IF v_need <= 0 OR v_brand = '' OR v_style = '' THEN
      RAISE EXCEPTION 'invalid line %', v_line;
    END IF;

    -- 1) Ver stock disponible efectivo (vista)
    SELECT COALESCE(SUM(qty),0) INTO v_avail
    FROM v_final_stock
    WHERE eff_brand_id = v_brand
      AND eff_style_id = v_style
      AND COALESCE(label_name,'') = COALESCE(v_label,'');
    IF v_avail < v_need THEN
      RAISE EXCEPTION 'INSUFFICIENT_FINAL_STOCK brand=% style=% label=% need=% avail=%', v_brand, v_style, v_label, v_need, v_avail;
    END IF;

    -- 2) Consumir FIFO en productions FINAL
    PERFORM 1;
    WHILE v_need > 0 LOOP
      WITH candidate AS (
        SELECT id, qty
        FROM productions
        WHERE status='FINAL'
          AND COALESCE(label_brand_id, brand_id) = v_brand
          AND COALESCE(label_style_id, style_id) = v_style
          AND COALESCE(label_name,'') = COALESCE(v_label,'')
          AND qty > 0
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE productions p
      SET qty = GREATEST(0, p.qty - LEAST(p.qty, v_need)),
          updated_at = v_now
      FROM candidate c
      WHERE p.id = c.id
      RETURNING LEAST(c.qty, v_need) INTO v_avail;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'FIFO_NOT_FOUND';
      END IF;

      v_need := v_need - v_avail;
    END LOOP;

    -- 3) Movimiento inventario
    INSERT INTO movements (id, type, ref_id, qty, provider, lot, date_time)
    VALUES ( 'MV-'||gen_random_uuid(), 'FINAL_SALE', 'SALE:'||p_remito, (v_line->>'qty')::int, '', '', v_now );

    -- 4) FG movement (opcional, reflejamos negativo)
    INSERT INTO fg_movements (date_time, type, ref_remito, client, brand_id, brand_name, style_id, style_name, qty, uom, reason, "user")
    VALUES ( v_now, 'sale', p_remito, p_client, v_brand, NULL, v_style, NULL, -ABS((v_line->>'qty')::int), v_uom, 'venta', p_user );

    -- 5) sales_processed
    INSERT INTO sales_processed (processed_at, remito, client, line_id, qty, item_code, brand_id, brand_name, style_id, style_name, uom, "user")
    VALUES ( v_now, p_remito, p_client, v_line_id, (v_line->>'qty')::int, v_code, v_brand, NULL, v_style, COALESCE(v_label,''), v_uom, p_user );

    v_processed := v_processed + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'processed', v_processed);
EXCEPTION WHEN OTHERS THEN
  v_err := SQLERRM;
  RETURN jsonb_build_object('ok', false, 'error', v_err);
END;
$$;
