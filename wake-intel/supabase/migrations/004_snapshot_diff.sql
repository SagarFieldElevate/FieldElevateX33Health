-- ============================================================
-- Migration 004 — Phase 5: snapshot diffing (fe33_ prefixed)
--
-- fe33_facility_diff_since_last compares a facility's current row to its prior
-- snapshot and returns a jsonb of changed fields. Called by run-monthly-refresh.
-- ============================================================

create or replace function fe33_facility_diff_since_last(p_facility_id uuid)
returns jsonb language plpgsql as $$
declare
  v_prev jsonb;
  v_curr jsonb;
  v_diff jsonb := '{}'::jsonb;
  v_fields text[] := array[
    'size_class','size_confidence','unit_count','licensed_beds',
    'building_sqft','ai_outreach_status','ai_priority','facility_type','operator'
  ];
  v_f text;
begin
  -- second-most-recent snapshot = the state before this run's snapshot
  select snapshot_data into v_prev
  from fe33_facility_snapshots
  where facility_id = p_facility_id
  order by created_at desc
  offset 1 limit 1;

  select to_jsonb(f) into v_curr from fe33_facilities f where id = p_facility_id;

  if v_prev is null then
    return v_diff; -- nothing to compare against yet
  end if;

  foreach v_f in array v_fields loop
    if v_prev ->> v_f is distinct from v_curr ->> v_f then
      v_diff := v_diff || jsonb_build_object(
        v_f, jsonb_build_object('from', v_prev -> v_f, 'to', v_curr -> v_f)
      );
    end if;
  end loop;

  return v_diff;
end; $$;
