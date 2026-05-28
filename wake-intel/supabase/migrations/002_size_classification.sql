-- ============================================================
-- Migration 002 — Phase 2: size classification (fe33_ prefixed)
-- ============================================================

-- Dedup support: one open review item per (facility, reason).
create unique index if not exists fe33_uniq_open_review_item
  on fe33_review_queue (facility_id, reason)
  where status = 'open';

create or replace function fe33_classify_facility_size(p_facility_id uuid)
returns text language plpgsql as $$
declare
  v_official integer;
  v_sqft integer;
  v_beds integer;
  v_class text;
  v_confidence text;
begin
  select numeric_value::int into v_official
  from fe33_size_estimation_signals
  where facility_id = p_facility_id
    and signal_type in ('official_unit_count','project_page')
    and confidence = 'high'
  order by created_at desc
  limit 1;

  if v_official is not null then
    if v_official >= 100 then
      v_class := 'confirmed_100_plus'; v_confidence := 'high';
    else
      v_class := 'confirmed_under_100'; v_confidence := 'high';
    end if;
  else
    select building_sqft, licensed_beds into v_sqft, v_beds
    from fe33_facilities where id = p_facility_id;

    if v_sqft >= 90000 then
      v_class := 'likely_100_plus'; v_confidence := 'medium';
    elsif v_sqft between 60000 and 89999 then
      v_class := 'possible_100_plus'; v_confidence := 'low';
    elsif v_beds is not null and v_beds < 75 then
      v_class := 'likely_under_100'; v_confidence := 'medium';
    elsif v_sqft > 0 and v_sqft < 60000 then
      v_class := 'likely_under_100'; v_confidence := 'medium';
    else
      v_class := 'unknown'; v_confidence := 'unknown';
    end if;
  end if;

  update fe33_facilities
  set size_class = v_class, size_confidence = v_confidence
  where id = p_facility_id;

  if v_class in ('unknown','possible_100_plus') then
    insert into fe33_review_queue (facility_id, reason, details)
    values (
      p_facility_id,
      'unknown_size',
      jsonb_build_object('sqft', v_sqft, 'beds', v_beds, 'class', v_class)
    )
    on conflict (facility_id, reason) where status = 'open' do nothing;
  end if;

  return v_class;
end; $$;
