-- sql/rpc_advance_production.sql
create or replace function public.fn_advance_production (
  p_prod_id         text,
  p_to              prod_status,
  p_label_brand_id  text default null,
  p_label_style_id  text default null,
  p_label_name      text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_now        timestamptz := now();
  v_from       prod_status;
  v_qty        integer;
  v_brand_id   text;
  v_style_id   text;
  v_lbl_bid    text;
  v_lbl_sid    text;
  v_lbl_name   text;
  v_visited_p  boolean := false;
  v_visited_e  boolean := false;
  v_merge_id   text;
  v_new_status prod_status;
  v_avail int;
begin
  if p_prod_id is null or p_to is null then
    raise exception 'MISSING_PARAMS';
  end if;

  select status, qty, brand_id, style_id, label_brand_id, label_style_id, label_name
    into v_from, v_qty, v_brand_id, v_style_id, v_lbl_bid, v_lbl_sid, v_lbl_name
  from productions where id = p_prod_id for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;

  v_new_status := p_to;

  if v_from = v_new_status then
    return jsonb_build_object('ok', true, 'id', p_prod_id, 'status', v_new_status);
  end if;

  if v_from = 'FINAL' then
    raise exception 'FINAL_IS_TERMINAL';
  end if;

  select bool_or("to"='PAUSTERIZADO'), bool_or("to"='ETIQUETADO')
    into v_visited_p, v_visited_e
  from prod_history where prod_id = p_prod_id;

  if v_from = 'ENLATADO' then
    if v_new_status not in ('PAUSTERIZADO','ETIQUETADO') then
      raise exception 'INVALID_TRANSITION';
    end if;
  elsif v_from = 'PAUSTERIZADO' then
    if v_new_status not in ('ETIQUETADO','FINAL') then
      raise exception 'INVALID_TRANSITION';
    end if;
    if v_new_status='ETIQUETADO' and v_visited_e then
      raise exception 'BACKWARD_NOT_ALLOWED_ONCE_VISITED to=ETIQUETADO';
    end if;
  elsif v_from = 'ETIQUETADO' then
    if v_new_status not in ('PAUSTERIZADO','FINAL') then
      raise exception 'INVALID_TRANSITION';
    end if;
    if v_new_status='PAUSTERIZADO' and v_visited_p then
      raise exception 'BACKWARD_NOT_ALLOWED_ONCE_VISITED to=PAUSTERIZADO';
    end if;
  end if;

  if v_new_status = 'ETIQUETADO' then
    v_lbl_bid := coalesce(p_label_brand_id, v_lbl_bid, v_brand_id);
    v_lbl_sid := coalesce(p_label_style_id, v_lbl_sid, v_style_id);
    v_lbl_name:= coalesce(p_label_name, v_lbl_name, '');

    if (v_lbl_sid is null or v_lbl_sid='') and (coalesce(v_lbl_name,'')='') then
      raise exception 'MISSING_LABEL_SELECTION';
    end if;

    if coalesce(v_lbl_sid,'')<>'' then
      select coalesce(sum(add_qty),0) - coalesce(sum(cons_qty),0) into v_avail
      from (
        select sum(qty)::int as add_qty, 0::int as cons_qty
          from labels
         where coalesce(is_custom,false)=false
           and brand_id = v_lbl_bid and style_id = v_lbl_sid and coalesce(name,'') = coalesce(v_lbl_name,'')
        union all
        select 0::int as add_qty, sum(qty)::int as cons_qty
          from movements
         where type='LABEL_CONS' and ref_id = ('LABEL:'||v_lbl_bid||'|'||v_lbl_sid||'|'||coalesce(v_lbl_name,''))
      ) s;
    else
      select coalesce(sum(add_qty),0) - coalesce(sum(cons_qty),0) into v_avail
      from (
        select sum(qty)::int as add_qty, 0::int as cons_qty
          from labels
         where coalesce(is_custom,false)=true and coalesce(name,'') = coalesce(v_lbl_name,'')
        union all
        select 0::int as add_qty, sum(qty)::int as cons_qty
          from movements
         where type='LABEL_CONS' and ref_id = ('LABEL:||'||coalesce(v_lbl_name,''))
      ) s;
    end if;

    if coalesce(v_avail,0) < v_qty then
      raise exception 'NO_LABEL_STOCK available=% needed=%', v_avail, v_qty;
    end if;

    update productions
       set label_brand_id = v_lbl_bid,
           label_style_id = v_lbl_sid,
           label_name     = v_lbl_name,
           updated_at     = v_now,
           status         = v_new_status
     where id = p_prod_id;

    insert into movements (id, type, ref_id, qty, provider, lot, date_time)
    values ('MV-'||gen_random_uuid(), 'LABEL_CONS',
            case when coalesce(v_lbl_sid,'') <> '' then ('LABEL:'||v_lbl_bid||'|'||v_lbl_sid||'|'||coalesce(v_lbl_name,''))
                 else ('LABEL:||'||coalesce(v_lbl_name,'')) end,
            v_qty, '', '', v_now);

    insert into prod_history (id, prod_id, "from", "to", date_time, note)
    values ('PH-'||gen_random_uuid(), p_prod_id, v_from, v_new_status, v_now, '');

    return jsonb_build_object('ok', true, 'id', p_prod_id, 'status', v_new_status);
  end if;

  if v_new_status = 'FINAL' then
    if v_from not in ('PAUSTERIZADO','ETIQUETADO') then
      raise exception 'FINAL_REQUIRES_P_OR_E';
    end if;

    select p2.id into v_merge_id
      from productions p1
      join productions p2
        on p2.status='FINAL'
       and coalesce(p2.label_brand_id, p2.brand_id) = coalesce(p1.label_brand_id, p1.brand_id)
       and coalesce(p2.label_style_id, p2.style_id) = coalesce(p1.label_style_id, p1.style_id)
       and coalesce(p2.label_name,'') = coalesce(p1.label_name,'')
     where p1.id = p_prod_id
       and p2.id <> p1.id
     limit 1;

    if v_merge_id is not null then
      update productions set qty = qty + v_qty, updated_at = v_now where id = v_merge_id;
      delete from productions where id = p_prod_id;

      insert into movements (id, type, ref_id, qty, provider, lot, date_time)
      values ('MV-'||gen_random_uuid(), 'PROD_FINAL_IN', 'PROD:'||p_prod_id, v_qty, '', '', v_now);

      insert into prod_history (id, prod_id, "from", "to", date_time, note)
      values ('PH-'||gen_random_uuid(), p_prod_id, v_from, 'FINAL', v_now, 'Fusionado con FINAL: '||v_merge_id);

      return jsonb_build_object('ok', true, 'id', v_merge_id, 'status', 'FINAL', 'merged', true);
    else
      update productions set status='FINAL', updated_at=v_now where id = p_prod_id;

      insert into movements (id, type, ref_id, qty, provider, lot, date_time)
      values ('MV-'||gen_random_uuid(), 'PROD_FINAL_IN', 'PROD:'||p_prod_id, v_qty, '', '', v_now);

      insert into prod_history (id, prod_id, "from", "to", date_time, note)
      values ('PH-'||gen_random_uuid(), p_prod_id, v_from, 'FINAL', v_now, '');

      return jsonb_build_object('ok', true, 'id', p_prod_id, 'status', 'FINAL', 'merged', false);
    end if;
  end if;

  update productions set status = v_new_status, updated_at = v_now where id = p_prod_id;
  insert into prod_history (id, prod_id, "from", "to", date_time, note)
  values ('PH-'||gen_random_uuid(), p_prod_id, v_from, v_new_status, v_now, '');

  return jsonb_build_object('ok', true, 'id', p_prod_id, 'status', v_new_status);
exception when others then
  return jsonb_build_object('ok', false, 'error', SQLERRM);
end;
$$;
