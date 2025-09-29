-- sql/views_labels_stock.sql
create or replace view public.v_label_stock_by_style as
with adds as (
  select
    l.brand_id,
    l.style_id,
    coalesce(l.name,'') as label_name,
    sum(coalesce(l.qty,0))::int as add_qty
  from public.labels l
  where coalesce(l.is_custom,false) = false
  group by 1,2,3
),
cons as (
  select
    nullif(split_part(split_part(m.ref_id, ':', 2), '|', 1), '') as brand_id,
    nullif(split_part(split_part(m.ref_id, ':', 2), '|', 2), '') as style_id,
    split_part(split_part(m.ref_id, ':', 2), '|', 3) as label_name,
    sum(coalesce(m.qty,0))::int as cons_qty
  from public.movements m
  where m.type = 'LABEL_CONS'
    and m.ref_id like 'LABEL:%'
  group by 1,2,3
),
base as (
  select
    a.brand_id,
    a.style_id,
    a.label_name,
    coalesce(a.add_qty,0) - coalesce(c.cons_qty,0) as stock
  from adds a
  left join cons c
    on c.brand_id = a.brand_id
   and c.style_id = a.style_id
   and coalesce(c.label_name,'') = coalesce(a.label_name,'')
)
select
  b.brand_id,
  b.style_id,
  br.name as brand_name,
  st.name as style_name,
  b.label_name,
  (b.stock)::int as stock
from base b
left join public.brands br on br.id = b.brand_id
left join public.styles st on st.style_id = b.style_id
where (b.stock) > 0
order by brand_name nulls last, style_name nulls last, label_name nulls last;
