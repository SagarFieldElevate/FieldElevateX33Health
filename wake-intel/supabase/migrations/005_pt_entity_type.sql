-- ============================================================
-- Migration 005 — Product B: focus PT intel on organizations (companies)
--
-- NPPES returns both individual practitioners (NPI-1) and organizations (NPI-2).
-- Product B is about which PT *companies* are active at facilities, so:
--   - add entity_type to providers (backfilled from the raw NPPES enumeration_type)
--   - the two PT views now count ONLY organizations for footprint + market status.
-- Individual-practitioner matches remain in the tables as supporting detail.
-- ============================================================

alter table fe33_therapy_providers
  add column if not exists entity_type text
  check (entity_type in ('organization','individual','unknown')) default 'unknown';

update fe33_therapy_providers set entity_type = case
  when raw_nppes_response->>'enumeration_type' = 'NPI-2' then 'organization'
  when raw_nppes_response->>'enumeration_type' = 'NPI-1' then 'individual'
  else 'unknown'
end;

create index if not exists fe33_idx_therapy_providers_entity on fe33_therapy_providers(entity_type);

-- Drop first: create-or-replace can't add a column mid-list to an existing view.
drop view if exists fe33_v_pt_provider_footprint;
drop view if exists fe33_v_facility_pt_summary;

-- Footprint = PT companies only.
create view fe33_v_pt_provider_footprint as
select
  tp.id as provider_id,
  tp.npi,
  tp.organization_name,
  tp.parent_organization,
  tp.taxonomy_description,
  tp.entity_type,
  count(distinct ftm.facility_id) filter (where ftm.is_current) as active_facility_count,
  count(distinct ftm.facility_id) filter (where ftm.is_current and f.size_class in ('confirmed_100_plus','likely_100_plus')) as qualified_facility_count,
  array_agg(distinct f.name) filter (where ftm.is_current) as facility_names,
  max(ftm.last_observed_at) as last_observed_at
from fe33_therapy_providers tp
left join fe33_facility_therapy_matches ftm on ftm.provider_id = tp.id
left join fe33_facilities f on f.id = ftm.facility_id
where tp.is_active = true and tp.entity_type = 'organization'
group by tp.id;

-- Facility PT market status, based on PT COMPANY incumbents (not individuals).
create view fe33_v_facility_pt_summary as
select
  f.id as facility_id,
  f.name,
  f.city,
  f.size_class,
  f.unit_count,
  count(distinct tp.id) filter (
    where ftm.is_current and ftm.match_confidence in ('high','medium') and tp.entity_type = 'organization'
  ) as confirmed_pt_provider_count,
  array_agg(distinct tp.organization_name) filter (
    where ftm.is_current and ftm.match_confidence in ('high','medium') and tp.entity_type = 'organization'
  ) as confirmed_pt_providers,
  case
    when count(distinct tp.id) filter (
      where ftm.is_current and ftm.match_confidence in ('high','medium') and tp.entity_type = 'organization'
    ) = 0 then 'open_market'
    when count(distinct tp.id) filter (
      where ftm.is_current and ftm.match_confidence in ('high','medium') and tp.entity_type = 'organization'
    ) = 1 then 'single_incumbent'
    else 'multi_provider'
  end as pt_market_status
from fe33_facilities f
left join fe33_facility_therapy_matches ftm on ftm.facility_id = f.id
left join fe33_therapy_providers tp on tp.id = ftm.provider_id
where f.size_class in ('confirmed_100_plus','likely_100_plus','possible_100_plus')
group by f.id;
