-- ============================================================
-- Wake Senior Living Intelligence Platform
-- Migration 001 — Initial schema (Phase 1: Foundation)
--
-- ⚠ All objects are prefixed `fe33_` and live in the `public` schema alongside the
--   project's existing tables (clinic_employee_data, payroll_data, etc.). Do NOT
--   touch or reference those existing tables.
--
-- Shared core:  fe33_facilities, fe33_facility_sources, fe33_size_estimation_signals
-- Product A:    fe33_contacts, fe33_call_notes + fe33_facilities.ai_* fields
-- Product B:    fe33_therapy_providers, fe33_facility_therapy_matches + 2 views
-- Operational:  fe33_monthly_runs, fe33_facility_snapshots, fe33_review_queue, fe33_audit_log
--
-- Apply via the Supabase SQL editor (paste) or CLI. Project: achrsfeajyvqqcrjcxvr.
-- ============================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";
-- pg_cron + pg_net (Phase 5) are enabled from Dashboard > Database > Extensions.

-- ============================================================
-- CORE: fe33_facilities (shared by Product A and Product B)
-- ============================================================
create table fe33_facilities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  city text,
  county text not null default 'Wake',
  state text not null default 'NC',
  zip text,
  latitude numeric,
  longitude numeric,
  parcel_pin text,
  website_url text,
  operator text,
  ownership_type text,
  facility_type text,
  size_class text check (size_class in (
    'confirmed_100_plus','likely_100_plus','possible_100_plus',
    'likely_under_100','confirmed_under_100','unknown'
  )) default 'unknown',
  size_confidence text check (size_confidence in ('high','medium','low','unknown')) default 'unknown',
  unit_count integer,
  unit_count_type text check (unit_count_type in ('exact','estimated','range','unknown')) default 'unknown',
  estimated_units integer,
  estimated_units_low integer,
  estimated_units_high integer,
  licensed_beds integer,
  building_sqft integer,
  acreage numeric,
  assessed_value numeric,
  property_use_code text,
  property_record_url text,
  year_built integer,
  -- Product A (Field Elevate AI sales)
  ai_outreach_status text check (ai_outreach_status in (
    'not_contacted','contacted','demo_scheduled','demo_done','proposal_sent','negotiating','won','lost','disqualified'
  )) default 'not_contacted',
  ai_outreach_status_changed_at timestamptz,
  ai_last_contact_at timestamptz,
  ai_current_software text,
  ai_pain_points text,
  ai_estimated_deal_size_cents bigint,
  ai_priority text check (ai_priority in ('hot','warm','cold','dead')) default 'cold',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid references auth.users(id),
  internal_notes text
);

create index fe33_idx_facilities_size_class on fe33_facilities(size_class);
create index fe33_idx_facilities_ai_status on fe33_facilities(ai_outreach_status);
create index fe33_idx_facilities_ai_priority on fe33_facilities(ai_priority);
create index fe33_idx_facilities_county on fe33_facilities(county);

-- ============================================================
-- Evidence + size signals (shared)
-- ============================================================
create table fe33_facility_sources (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid references fe33_facilities(id) on delete cascade,
  source_type text not null,
  source_url text,
  raw_response jsonb,
  extracted_value jsonb,
  confidence text,
  fetched_at timestamptz default now(),
  notes text
);
create index fe33_idx_facility_sources_facility on fe33_facility_sources(facility_id);

create table fe33_size_estimation_signals (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid references fe33_facilities(id) on delete cascade,
  signal_type text not null,
  signal_value text,
  numeric_value numeric,
  source_url text,
  confidence text check (confidence in ('high','medium','low')),
  notes text,
  created_at timestamptz default now()
);
create index fe33_idx_size_signals_facility on fe33_size_estimation_signals(facility_id);

-- ============================================================
-- PRODUCT B: PT market intelligence (NPI-driven)
-- ============================================================
create table fe33_therapy_providers (
  id uuid primary key default gen_random_uuid(),
  npi text unique,
  organization_name text not null,
  parent_organization text,
  taxonomy_code text,
  taxonomy_description text,
  primary_address text,
  city text,
  state text,
  zip text,
  phone text,
  is_active boolean default true,
  raw_nppes_response jsonb,
  first_seen_at timestamptz default now(),
  last_verified_at timestamptz default now()
);
create index fe33_idx_therapy_providers_org on fe33_therapy_providers(organization_name);
create index fe33_idx_therapy_providers_parent on fe33_therapy_providers(parent_organization);
create index fe33_idx_therapy_providers_zip on fe33_therapy_providers(zip);

create table fe33_facility_therapy_matches (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid references fe33_facilities(id) on delete cascade,
  provider_id uuid references fe33_therapy_providers(id) on delete cascade,
  match_confidence text check (match_confidence in ('high','medium','low','unknown')) default 'unknown',
  match_evidence text,
  evidence_url text,
  named_provider text,
  is_current boolean default true,
  first_observed_at timestamptz default now(),
  last_observed_at timestamptz default now(),
  unique(facility_id, provider_id)
);
create index fe33_idx_ftm_facility on fe33_facility_therapy_matches(facility_id);
create index fe33_idx_ftm_provider on fe33_facility_therapy_matches(provider_id);

create or replace view fe33_v_pt_provider_footprint as
select
  tp.id as provider_id,
  tp.npi,
  tp.organization_name,
  tp.parent_organization,
  tp.taxonomy_description,
  count(distinct ftm.facility_id) filter (where ftm.is_current) as active_facility_count,
  count(distinct ftm.facility_id) filter (where ftm.is_current and f.size_class in ('confirmed_100_plus','likely_100_plus')) as qualified_facility_count,
  array_agg(distinct f.name) filter (where ftm.is_current) as facility_names,
  max(ftm.last_observed_at) as last_observed_at
from fe33_therapy_providers tp
left join fe33_facility_therapy_matches ftm on ftm.provider_id = tp.id
left join fe33_facilities f on f.id = ftm.facility_id
where tp.is_active = true
group by tp.id;

create or replace view fe33_v_facility_pt_summary as
select
  f.id as facility_id,
  f.name,
  f.city,
  f.size_class,
  f.unit_count,
  count(ftm.id) filter (where ftm.is_current and ftm.match_confidence in ('high','medium')) as confirmed_pt_provider_count,
  array_agg(distinct tp.organization_name) filter (where ftm.is_current and ftm.match_confidence in ('high','medium')) as confirmed_pt_providers,
  case
    when count(ftm.id) filter (where ftm.is_current and ftm.match_confidence in ('high','medium')) = 0 then 'open_market'
    when count(ftm.id) filter (where ftm.is_current and ftm.match_confidence = 'high') = 1 then 'single_incumbent'
    when count(ftm.id) filter (where ftm.is_current and ftm.match_confidence in ('high','medium')) > 1 then 'multi_provider'
    else 'uncertain'
  end as pt_market_status
from fe33_facilities f
left join fe33_facility_therapy_matches ftm on ftm.facility_id = f.id
left join fe33_therapy_providers tp on tp.id = ftm.provider_id
where f.size_class in ('confirmed_100_plus','likely_100_plus','possible_100_plus')
group by f.id;

-- ============================================================
-- PRODUCT A: CRM layer (Field Elevate AI sales)
-- ============================================================
create table fe33_contacts (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid references fe33_facilities(id) on delete cascade,
  name text not null,
  title text,
  is_primary boolean default false,
  phone text,
  phone_direct text,
  email text,
  linkedin_url text,
  data_source text check (data_source in ('apollo','web_search','phone_call','facility_site','referral','manual','other')),
  source_url text,
  verified_at timestamptz,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index fe33_idx_contacts_facility on fe33_contacts(facility_id);

create table fe33_call_notes (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid references fe33_facilities(id) on delete cascade,
  contact_id uuid references fe33_contacts(id) on delete set null,
  interaction_type text check (interaction_type in (
    'call_inbound','call_outbound','voicemail','email_inbound','email_outbound','meeting','demo','note'
  )) default 'call_outbound',
  interaction_date timestamptz not null default now(),
  duration_minutes integer,
  summary text not null,
  outcome text check (outcome in (
    'connected','no_answer','left_voicemail','meeting_scheduled','demo_scheduled','demo_completed','not_interested','follow_up_needed','closed_won','closed_lost'
  )),
  ai_solutions_pitched text[],
  follow_up_at timestamptz,
  follow_up_done boolean default false,
  logged_by uuid references auth.users(id),
  created_at timestamptz default now()
);
create index fe33_idx_call_notes_facility on fe33_call_notes(facility_id);
create index fe33_idx_call_notes_follow_up on fe33_call_notes(follow_up_at) where follow_up_done = false;

-- ============================================================
-- Operational (shared)
-- ============================================================
create table fe33_monthly_runs (
  id uuid primary key default gen_random_uuid(),
  run_type text check (run_type in ('full_refresh','size_only','therapy_only','manual')) default 'full_refresh',
  status text check (status in ('pending','running','succeeded','failed','partial')) default 'pending',
  started_at timestamptz default now(),
  finished_at timestamptz,
  facilities_processed integer default 0,
  facilities_changed integer default 0,
  new_facilities_added integer default 0,
  pt_providers_added integer default 0,
  pt_provider_changes integer default 0,
  errors jsonb default '[]'::jsonb,
  triggered_by uuid references auth.users(id)
);

create table fe33_facility_snapshots (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid references fe33_facilities(id) on delete cascade,
  monthly_run_id uuid references fe33_monthly_runs(id) on delete cascade,
  snapshot_data jsonb not null,
  created_at timestamptz default now()
);
create index fe33_idx_snapshots_facility on fe33_facility_snapshots(facility_id, created_at desc);

create table fe33_review_queue (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid references fe33_facilities(id) on delete cascade,
  reason text not null,
  details jsonb,
  status text check (status in ('open','approved','rejected','deferred')) default 'open',
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id),
  resolution_notes text,
  created_at timestamptz default now()
);
create index fe33_idx_review_queue_status on fe33_review_queue(status);

create table fe33_audit_log (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid not null,
  action text check (action in ('insert','update','delete')),
  changed_fields jsonb,
  old_values jsonb,
  new_values jsonb,
  changed_by uuid references auth.users(id),
  changed_at timestamptz default now()
);
create index fe33_idx_audit_log_record on fe33_audit_log(table_name, record_id);

-- ============================================================
-- Triggers: updated_at maintenance
-- ============================================================
create or replace function fe33_trg_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;

create trigger fe33_facilities_updated before update on fe33_facilities
  for each row execute function fe33_trg_updated_at();
create trigger fe33_contacts_updated before update on fe33_contacts
  for each row execute function fe33_trg_updated_at();

-- ============================================================
-- Triggers: audit log
-- ============================================================
create or replace function fe33_trg_audit() returns trigger as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_changed jsonb;
  v_actor uuid;
begin
  begin
    v_actor := auth.uid();
  exception when others then
    v_actor := null;
  end;

  if (tg_op = 'DELETE') then
    insert into fe33_audit_log(table_name, record_id, action, old_values, changed_by)
    values (tg_table_name, old.id, 'delete', to_jsonb(old), v_actor);
    return old;
  elsif (tg_op = 'UPDATE') then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    select jsonb_object_agg(key, v_new -> key) into v_changed
    from jsonb_object_keys(v_new) as key
    where (v_new -> key) is distinct from (v_old -> key);
    insert into fe33_audit_log(table_name, record_id, action, changed_fields, old_values, new_values, changed_by)
    values (tg_table_name, new.id, 'update', coalesce(v_changed, '{}'::jsonb), v_old, v_new, v_actor);
    return new;
  else
    insert into fe33_audit_log(table_name, record_id, action, new_values, changed_by)
    values (tg_table_name, new.id, 'insert', to_jsonb(new), v_actor);
    return new;
  end if;
end; $$ language plpgsql security definer;

create trigger fe33_facilities_audit after insert or update or delete on fe33_facilities
  for each row execute function fe33_trg_audit();
create trigger fe33_contacts_audit after insert or update or delete on fe33_contacts
  for each row execute function fe33_trg_audit();
create trigger fe33_call_notes_audit after insert or update or delete on fe33_call_notes
  for each row execute function fe33_trg_audit();
create trigger fe33_ftm_audit after insert or update or delete on fe33_facility_therapy_matches
  for each row execute function fe33_trg_audit();
create trigger fe33_review_queue_audit after insert or update or delete on fe33_review_queue
  for each row execute function fe33_trg_audit();

-- ============================================================
-- Row Level Security (authenticated read & write; anon has no access)
-- ============================================================
alter table fe33_facilities enable row level security;
alter table fe33_facility_sources enable row level security;
alter table fe33_size_estimation_signals enable row level security;
alter table fe33_therapy_providers enable row level security;
alter table fe33_facility_therapy_matches enable row level security;
alter table fe33_contacts enable row level security;
alter table fe33_call_notes enable row level security;
alter table fe33_monthly_runs enable row level security;
alter table fe33_facility_snapshots enable row level security;
alter table fe33_review_queue enable row level security;
alter table fe33_audit_log enable row level security;

do $$
declare
  t text;
  rls_tables text[] := array[
    'fe33_facilities','fe33_facility_sources','fe33_size_estimation_signals','fe33_therapy_providers',
    'fe33_facility_therapy_matches','fe33_contacts','fe33_call_notes','fe33_monthly_runs',
    'fe33_facility_snapshots','fe33_review_queue','fe33_audit_log'
  ];
begin
  foreach t in array rls_tables loop
    execute format('create policy "auth read %1$s" on %1$I for select to authenticated using (true);', t);
    execute format('create policy "auth write %1$s" on %1$I for all to authenticated using (true) with check (true);', t);
  end loop;
end $$;
