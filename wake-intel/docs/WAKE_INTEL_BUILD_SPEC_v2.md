# Wake Senior Living Intelligence Platform — Build Specification

**Project owner:** Sagar (Field Elevate)
**Sponsor:** Dusty Field
**Primary user:** Keira — runs the sales pipeline
**Secondary users:** Sagar, Dusty — strategy and PT market intelligence
**Target completion:** MVP in 3 weeks
**Stack:** Supabase (Postgres + Edge Functions + pg_cron) + Next.js 14 (App Router) + TypeScript + Tailwind + shadcn/ui
**Repo:** TBD — recommend `field-elevate/wake-senior-intel`

---

## 0. Context (Read This First)

### 0.1 What we're building

**One platform, two products that share the same data foundation.**

**Product A — Field Elevate AI Sales Tracker (active)**
- Field Elevate sells AI/software solutions that optimize senior living day-to-day operations.
- Target market: senior living communities (100+ units) in Wake County, NC — to start.
- Keira runs the pipeline: outreach, demos, proposals, follow-ups.
- This is the **active** product. Most of the UI, CRM, monthly reporting, and outreach logic exists for this.

**Product B — 33 Health PT Market Intelligence (passive)**
- 33 Health may want to move into PT services for senior living in the future.
- For now we just want a clear, current picture of **which PT companies are active at which Wake County senior facilities**, derived from NPI registrations at facility addresses.
- No outreach. No CRM. No reports. Just a read-only dashboard refreshed monthly.
- Activated later if/when 33 Health decides to make a move.

### 0.2 Why these two share infrastructure

Both products need the same underlying data:
- A clean list of Wake County 100+ unit senior living facilities
- Address + parcel + size enrichment
- Operator, facility type, ownership
- Monthly refresh

Product A adds a CRM layer (contacts, call notes, outreach status, monthly report). Product B adds a different lens on the NPI-derived therapy provider data already collected.

Single Supabase project. Single Next.js app. Two dashboard routes.

### 0.3 Not in scope

- Multi-state expansion (Wake County only for MVP)
- Multi-tenant auth / billing / marketing site
- Active 33 Health PT outreach (just intel, not sales)
- Integration with Field Elevate's actual product demos / deal CRM (Salesforce, HubSpot, etc.)
- Mobile app

### 0.4 Companion document

`NC_Wake_Senior_Living_Tracker_Codex_Report.pdf` defines the underlying data pipeline rationale, source list, and confidence scoring. This spec extends it with two-product framing, CRM, UI, and end-to-end delivery.

---

## 1. Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                       Next.js Frontend                                │
│                                                                       │
│   /  ────────────  Sales dashboard (Product A — Keira)               │
│   /facility/[id]   Facility detail + contacts + call notes            │
│   /review          Review queue                                       │
│   /follow-ups      Calls due today/this week                          │
│   /reports         Monthly AI sales report archive                    │
│   /pt-intel        PT market intelligence (Product B — Sagar/Dusty)  │
│   /pt-intel/providers/[id]  Drill-down on a PT company                │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                ┌────────────┴────────────┐
                │   Supabase REST + RPC   │
                │   (Postgres + RLS)      │
                └────────────┬────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
┌───────▼────────┐  ┌────────▼────────┐  ┌────────▼────────┐
│ Edge Functions │  │   pg_cron jobs  │  │  Storage bucket │
│ enrich-parcel  │  │ monthly-refresh │  │  evidence/      │
│ enrich-therapy │  │ snapshot-diff   │  │  scraped HTML   │
│ enrich-site    │  │                 │  │                 │
│ generate-report│  │                 │  │                 │
└───────┬────────┘  └─────────────────┘  └─────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────────┐
│  NPPES NPI Registry v2.1    Wake Open Data ArcGIS REST   │
│  NC DHSR XLSX downloads     Facility websites (scraped)  │
└──────────────────────────────────────────────────────────┘
```

**Key decisions:**
- Both products read from the same `facilities` table. Product A adds joins to `contacts`, `call_notes`, `outreach_status`. Product B adds joins to `therapy_providers`, `facility_therapy_matches`.
- All enrichment is in Edge Functions, callable from cron or UI.
- Every external API hit is persisted in `facility_sources.raw_response` for replay and audit.
- The frontend reads via PostgREST + RLS; writes go through Edge Functions where business logic lives.

---

## 2. Phase Plan

| Phase | Title                                              | Days | Blocking? |
| ----- | -------------------------------------------------- | ---- | --------- |
| 1     | Foundation — schema, Supabase, seed 30 facilities  | 2    | Yes       |
| 2     | Automated enrichment — parcels, NPI, facility sites| 4    | Yes       |
| 3     | Product A CRM — contacts, notes, AI sales pipeline | 2    | Yes       |
| 4     | Review queue & manual override workflow            | 1    | No        |
| 5     | Monthly cron + snapshot diffing                    | 2    | No        |
| 6     | Reporting — Keira's monthly AI sales report        | 2    | No        |
| 7     | Frontend — sales dashboard + PT intel dashboard    | 5    | Yes       |
| 8     | Deployment, contact sprint, runbook                | 1    | Yes       |

**Total:** ~19 working days for one solid dev.

---

## Phase 1: Foundation

### 1.1 Goal
Stand up Supabase, define schema, load the 30 seed facilities from the Codex report.

### 1.2 Setup

1. Create Supabase project `wake-senior-intel`. Note project ref and keys.
2. Enable extensions:
   ```sql
   create extension if not exists "uuid-ossp";
   create extension if not exists "pg_cron";
   create extension if not exists "pg_net";
   create extension if not exists "pgcrypto";
   ```
3. Init Next.js app:
   ```bash
   npx create-next-app@latest wake-intel --typescript --tailwind --app
   cd wake-intel
   npm i @supabase/supabase-js @supabase/ssr lucide-react resend
   npx shadcn@latest init
   ```
4. Env vars in `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   SUPABASE_SERVICE_ROLE_KEY=
   NPPES_BASE_URL=https://npiregistry.cms.hhs.gov/api
   WAKE_PARCELS_BASE_URL=https://maps.wake.gov/arcgis/rest/services
   RESEND_API_KEY=
   APOLLO_API_KEY=            # optional, Phase 8
   APP_BASE_URL=http://localhost:3000
   ```

### 1.3 Schema — Migration `001_initial.sql`

```sql
-- ============================================================
-- CORE: facilities (shared by Product A and Product B)
-- ============================================================
create table facilities (
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
  operator text,                            -- 'Atria', 'Brookdale', 'Kisco', 'Independent', ...
  ownership_type text,                      -- 'corporate_chain' | 'regional_chain' | 'independent' | 'non_profit'
  facility_type text,                       -- 'IL' | 'AL' | 'CCRC' | 'mixed' | '55plus'
  -- size (per Codex report)
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
  -- ====== PRODUCT A fields (Field Elevate AI sales) ======
  ai_outreach_status text check (ai_outreach_status in (
    'not_contacted','contacted','demo_scheduled','demo_done','proposal_sent','negotiating','won','lost','disqualified'
  )) default 'not_contacted',
  ai_outreach_status_changed_at timestamptz,
  ai_last_contact_at timestamptz,
  ai_current_software text,                 -- what they use today (free-text for now)
  ai_pain_points text,                      -- free-text notes
  ai_estimated_deal_size_cents bigint,      -- annual contract value estimate
  ai_priority text check (ai_priority in ('hot','warm','cold','dead')) default 'cold',
  -- ====== Shared audit ======
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid references auth.users(id),
  internal_notes text
);

create index idx_facilities_size_class on facilities(size_class);
create index idx_facilities_ai_status on facilities(ai_outreach_status);
create index idx_facilities_ai_priority on facilities(ai_priority);
create index idx_facilities_county on facilities(county);

-- ============================================================
-- Evidence + size signals (shared)
-- ============================================================
create table facility_sources (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid references facilities(id) on delete cascade,
  source_type text not null,                -- 'wake_parcel','nppes','dhsr','facility_site','manual','apollo'
  source_url text,
  raw_response jsonb,
  extracted_value jsonb,
  confidence text,
  fetched_at timestamptz default now(),
  notes text
);

create table size_estimation_signals (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid references facilities(id) on delete cascade,
  signal_type text not null,
  signal_value text,
  numeric_value numeric,
  source_url text,
  confidence text check (confidence in ('high','medium','low')),
  notes text,
  created_at timestamptz default now()
);

-- ============================================================
-- PRODUCT B: PT market intelligence (NPI-driven)
-- ============================================================
create table therapy_providers (
  id uuid primary key default gen_random_uuid(),
  npi text unique,                          -- NPPES NPI number (unique identifier)
  organization_name text not null,
  parent_organization text,                 -- e.g. 'WakeMed Health & Hospitals' for sub-locations
  taxonomy_code text,                       -- '225100000X' = PT, '225X00000X' = OT, etc
  taxonomy_description text,
  primary_address text,
  city text,
  state text,
  zip text,
  phone text,
  is_active boolean default true,           -- NPPES deactivation flag
  raw_nppes_response jsonb,
  first_seen_at timestamptz default now(),
  last_verified_at timestamptz default now()
);

create index idx_therapy_providers_org on therapy_providers(organization_name);
create index idx_therapy_providers_parent on therapy_providers(parent_organization);
create index idx_therapy_providers_zip on therapy_providers(zip);

create table facility_therapy_matches (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid references facilities(id) on delete cascade,
  provider_id uuid references therapy_providers(id) on delete cascade,
  match_confidence text check (match_confidence in ('high','medium','low','unknown')) default 'unknown',
  match_evidence text,                      -- 'same_address_npi','facility_site_mention','provider_location_page','job_posting'
  evidence_url text,
  named_provider text,                      -- canonical display name
  is_current boolean default true,
  first_observed_at timestamptz default now(),
  last_observed_at timestamptz default now(),
  unique(facility_id, provider_id)
);

create index idx_ftm_facility on facility_therapy_matches(facility_id);
create index idx_ftm_provider on facility_therapy_matches(provider_id);

-- View: PT provider footprint across Wake senior living
create or replace view v_pt_provider_footprint as
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
from therapy_providers tp
left join facility_therapy_matches ftm on ftm.provider_id = tp.id
left join facilities f on f.id = ftm.facility_id
where tp.is_active = true
group by tp.id;

-- View: Each facility's current PT situation
create or replace view v_facility_pt_summary as
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
from facilities f
left join facility_therapy_matches ftm on ftm.facility_id = f.id
left join therapy_providers tp on tp.id = ftm.provider_id
where f.size_class in ('confirmed_100_plus','likely_100_plus','possible_100_plus')
group by f.id;

-- ============================================================
-- PRODUCT A: CRM layer (Field Elevate AI sales)
-- ============================================================
create table contacts (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid references facilities(id) on delete cascade,
  name text not null,
  title text,                               -- 'Executive Director', 'Community Relations Director', 'Operations Director', 'IT Manager', etc
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

create index idx_contacts_facility on contacts(facility_id);

create table call_notes (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid references facilities(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  interaction_type text check (interaction_type in (
    'call_inbound','call_outbound','voicemail','email_inbound','email_outbound','meeting','demo','note'
  )) default 'call_outbound',
  interaction_date timestamptz not null default now(),
  duration_minutes integer,
  summary text not null,
  outcome text check (outcome in (
    'connected','no_answer','left_voicemail','meeting_scheduled','demo_scheduled','demo_completed','not_interested','follow_up_needed','closed_won','closed_lost'
  )),
  ai_solutions_pitched text[],              -- which products were discussed: ['scheduling','intake_automation','family_portal']
  follow_up_at timestamptz,
  follow_up_done boolean default false,
  logged_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create index idx_call_notes_facility on call_notes(facility_id);
create index idx_call_notes_follow_up on call_notes(follow_up_at) where follow_up_done = false;

-- ============================================================
-- Operational (shared)
-- ============================================================
create table monthly_runs (
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

create table facility_snapshots (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid references facilities(id) on delete cascade,
  monthly_run_id uuid references monthly_runs(id) on delete cascade,
  snapshot_data jsonb not null,
  created_at timestamptz default now()
);

create index idx_snapshots_facility on facility_snapshots(facility_id, created_at desc);

create table review_queue (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid references facilities(id) on delete cascade,
  reason text not null,
  details jsonb,
  status text check (status in ('open','approved','rejected','deferred')) default 'open',
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id),
  resolution_notes text,
  created_at timestamptz default now()
);

create index idx_review_queue_status on review_queue(status);

create table audit_log (
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

-- Updated_at triggers
create or replace function trg_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;

create trigger facilities_updated before update on facilities
  for each row execute function trg_updated_at();
create trigger contacts_updated before update on contacts
  for each row execute function trg_updated_at();
```

### 1.4 RLS

Internal tool, all authenticated users read everything. Restrict writes by role later if needed.

```sql
alter table facilities enable row level security;
alter table contacts enable row level security;
alter table call_notes enable row level security;
alter table facility_sources enable row level security;
alter table review_queue enable row level security;
alter table monthly_runs enable row level security;
alter table therapy_providers enable row level security;
alter table facility_therapy_matches enable row level security;

create policy "auth read facilities" on facilities for select to authenticated using (true);
create policy "auth write facilities" on facilities for all to authenticated using (true) with check (true);
-- Repeat for all tables
```

### 1.5 Seed import

Script `scripts/seed-facilities.ts` loads the 30 from section 4 of the Codex report. Pre-populate the three known cases:
- Searstone — `unit_count: 321, size_class: 'confirmed_100_plus'`
- The Cardinal at North Hills — `unit_count: 191, size_class: 'confirmed_100_plus'`
- Wakefield Manor — `unit_count: 96, size_class: 'confirmed_under_100'`

### 1.6 Acceptance criteria

- [ ] Supabase project live, all 12 tables migrated, RLS applied
- [ ] Both PT intel views (`v_pt_provider_footprint`, `v_facility_pt_summary`) queryable
- [ ] Next.js app boots and connects to Supabase
- [ ] 30 seed facilities imported with 3 confirmed unit counts + 1 confirmed under-100 exclusion
- [ ] Audit log captures inserts/updates

---

## Phase 2: Automated Enrichment Pipeline

### 2.1 Goal
For each facility, automatically pull and score data from external sources to produce a `size_class` and detect onsite PT providers (which powers both Product A's qualification and Product B's intelligence).

### 2.2 Edge Function: `enrich-parcel`

Hit Wake County ArcGIS REST API → building sqft, year built, assessed value, use code, lot size.

**Endpoint:** `POST /functions/v1/enrich-parcel`
**Body:** `{ facility_id: uuid }`

Wake parcel service: `https://maps.wake.gov/arcgis/rest/services/Property/Parcels/MapServer/0/query`

```ts
// supabase/functions/enrich-parcel/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const { facility_id } = await req.json();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: facility } = await supabase
    .from("facilities").select("*").eq("id", facility_id).single();

  if (!facility?.address) {
    return new Response(JSON.stringify({ error: "no_address" }), { status: 400 });
  }

  const where = encodeURIComponent(`SITE_ADDRESS LIKE '%${facility.address.split(" ")[0]}%'`);
  const url = `https://maps.wake.gov/arcgis/rest/services/Property/Parcels/MapServer/0/query?where=${where}&outFields=*&returnGeometry=false&f=json`;

  const res = await fetch(url);
  const json = await res.json();
  const feature = json.features?.[0]?.attributes;
  if (!feature) {
    return new Response(JSON.stringify({ status: "no_match" }));
  }

  await supabase.from("facility_sources").insert({
    facility_id,
    source_type: "wake_parcel",
    source_url: url,
    raw_response: json,
    extracted_value: feature,
  });

  await supabase.from("facilities").update({
    building_sqft: feature.HEATED_AREA,
    assessed_value: feature.TOTAL_VALUE,
    year_built: feature.YEAR_BUILT,
    property_use_code: feature.LAND_CLASS,
    acreage: feature.ACREAGE,
    parcel_pin: feature.PIN_NUM,
    property_record_url: `https://services.wake.gov/realestate/Account.asp?id=${feature.PIN_NUM}`,
  }).eq("id", facility_id);

  await supabase.from("size_estimation_signals").insert({
    facility_id,
    signal_type: "sqft_estimate",
    numeric_value: feature.HEATED_AREA,
    source_url: url,
    confidence: feature.HEATED_AREA > 90000 ? "high" : feature.HEATED_AREA > 60000 ? "medium" : "low",
    notes: `Wake parcel heated area = ${feature.HEATED_AREA} sqft`,
  });

  return new Response(JSON.stringify({ status: "ok", sqft: feature.HEATED_AREA }));
});
```

### 2.3 Edge Function: `enrich-therapy-provider` — critical for Product B

NPPES API v2.1 query for PT/OT/rehab providers at facility's address. Each match upserts into `therapy_providers` and creates a `facility_therapy_matches` row.

**Endpoint:** `POST /functions/v1/enrich-therapy-provider`
**Body:** `{ facility_id: uuid }`

NPPES base: `https://npiregistry.cms.hhs.gov/api/?version=2.1`

**Taxonomy codes to query:**
| Code | Description |
|------|-------------|
| `225100000X` | Physical Therapist |
| `2251X0800X` | Physical Therapist, Orthopedic |
| `2251H1200X` | Physical Therapist, Hand |
| `225X00000X` | Occupational Therapist |
| `2355S0801X` | Speech-Language Pathologist (often bundled with PT/OT) |
| `261QR0400X` | Rehabilitation Clinic/Center |
| `261QM1300X` | Multi-Specialty Clinic |

**Logic:**

1. Skip if `size_class in ('confirmed_under_100','likely_under_100')`.
2. For each taxonomy code:
   ```
   GET https://npiregistry.cms.hhs.gov/api/?version=2.1
     &postal_code={zip}
     &state=NC
     &city={city}
     &taxonomy_description={description}
     &address_purpose=LOCATION
     &limit=50
   ```
3. For each provider returned, check if any `addresses[].address_1` fuzzy-matches the facility address (normalize "St" / "Street", strip suite numbers, case-insensitive).
4. Upsert into `therapy_providers` by NPI. Set `parent_organization` if the org name contains a known parent (e.g. "WakeMed Physical Therapy - Cambridge Village" → parent = "WakeMed Health & Hospitals").
5. Insert/update `facility_therapy_matches` with confidence per Codex section 6:
   - **High**: same-address NPI + PT taxonomy + confirmed via facility site OR provider's own location page
   - **Medium**: same-address NPI + PT taxonomy
   - **Low**: NPI within 0.5 miles OR job posting mention
   - **Unknown**: no match

**Important for Product B:** even if there's no exact-address match, still record the *attempt* so we don't re-query needlessly. Use `match_confidence='unknown'` with `match_evidence='nppes_no_match'`.

### 2.4 Edge Function: `enrich-facility-site`

Scrape facility's own site for unit count language and explicit PT provider mentions. Most fragile — handle failures gracefully.

**Body:** `{ facility_id: uuid }`

Strategy:
1. Fetch homepage + common subpaths: `/floor-plans`, `/residences`, `/amenities`, `/services`, `/about`, `/health-services`.
2. Light HTML parsing:
   - Unit count: `/(\d{2,4})\s+(units?|apartments?|residences|homes?|suites)/i`
   - PT mention: `/(on-?site|in-house|partner|contracted)\s+(physical|occupational)\s+therapy/i`
   - Named providers: `/WakeMed|Genesis Rehab|Aegis Therapies|Fox Rehabilitation|Reliant Rehab|Encompass Health|Powerback/i`
3. Save raw HTML to storage bucket `evidence/{facility_id}/{timestamp}.html`.
4. Insert findings as `size_estimation_signals` and/or upgrade `facility_therapy_matches.match_confidence` to `high` if a named provider is found.

Rate-limit to 1 req/sec per host. If blocked (403/429), log to `facility_sources` and move on.

### 2.5 Size classification function

```sql
create or replace function classify_facility_size(p_facility_id uuid)
returns text language plpgsql as $$
declare
  v_official integer;
  v_sqft integer;
  v_beds integer;
  v_class text;
  v_confidence text;
begin
  select numeric_value::int into v_official
  from size_estimation_signals
  where facility_id = p_facility_id
    and signal_type in ('official_unit_count','project_page')
    and confidence = 'high'
  order by created_at desc limit 1;

  if v_official is not null then
    if v_official >= 100 then
      v_class := 'confirmed_100_plus'; v_confidence := 'high';
    else
      v_class := 'confirmed_under_100'; v_confidence := 'high';
    end if;
  else
    select building_sqft, licensed_beds into v_sqft, v_beds from facilities where id = p_facility_id;

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

  update facilities set size_class = v_class, size_confidence = v_confidence
  where id = p_facility_id;

  if v_class in ('unknown','possible_100_plus') then
    insert into review_queue (facility_id, reason, details)
    values (p_facility_id, 'unknown_size',
            jsonb_build_object('sqft', v_sqft, 'beds', v_beds, 'class', v_class))
    on conflict do nothing;
  end if;

  return v_class;
end; $$;
```

### 2.6 NC DHSR loader

Edge Function `import-dhsr` runs monthly. Downloads Adult Care Home + Nursing Home XLSX from `https://info.ncdhhs.gov/dhsr/ahc/listings.html`, filters Wake County, fuzzy-matches against existing facilities → updates `licensed_beds`, `facility_type`. Unmatched rows with 75+ beds → review queue.

**Important caveat:** DHSR does not license pure independent living in NC. Document this clearly.

### 2.7 Acceptance criteria

- [ ] All 30 seed facilities have a Wake parcel row in `facility_sources`
- [ ] ≥80% have `building_sqft` populated
- [ ] All facilities with `size_class != 'confirmed_under_100'` have an NPPES enrichment run
- [ ] ≥2 facilities have a `facility_therapy_matches` row with `match_confidence='high'`
- [ ] `v_pt_provider_footprint` view returns ≥3 PT providers with non-zero facility counts
- [ ] `size_class` populated on all 30 facilities
- [ ] Borderline facilities appear in `review_queue`

---

## Phase 3: Product A CRM — AI Sales Pipeline

### 3.1 Goal
Make the facility list workable for Keira: contacts, calls, pipeline status, follow-ups. This is the **active product** layer.

### 3.2 Contact model

Each facility typically needs:
- **Executive Director** — operations decision-maker, signs vendor contracts
- **Community Relations / Sales Director** — gatekeeper, easier to reach first
- **Operations Director / IT Manager** — sometimes the actual buyer for ops software

Mark one as `is_primary=true`. UI supports adding more (Regional VPs, parent company contacts).

### 3.3 Contact data sources

Captured in `contacts.data_source`:
- `apollo` — via Apollo.io company search
- `web_search` — Google + LinkedIn snippet review
- `phone_call` — called front desk and asked
- `facility_site` — listed on facility's leadership page
- `referral` — Keira got name from another contact
- `manual` — typed in without specific source

### 3.4 Call notes workflow

When Keira logs a call:
1. Land on facility detail (from dashboard or follow-ups list).
2. Click "Log call" → modal.
3. Pick contact (defaults to primary).
4. Pick interaction type (`call_outbound` default).
5. Type summary.
6. Set outcome.
7. **For Product A specifically:** multi-select which AI solutions were pitched (`ai_solutions_pitched` array): `scheduling`, `intake_automation`, `family_portal`, `maintenance_triage`, `staff_comms`, `resident_engagement`, `ops_dashboard`, `other`.
8. Set follow-up date if needed.
9. Submit → updates `facility.ai_last_contact_at` and `ai_outreach_status` automatically.

### 3.5 Pipeline status rollup trigger

```sql
create or replace function trg_rollup_ai_outreach() returns trigger as $$
declare
  v_new_status text;
begin
  -- Determine new status from outcome
  v_new_status := case
    when new.outcome = 'demo_scheduled' then 'demo_scheduled'
    when new.outcome = 'demo_completed' then 'demo_done'
    when new.outcome = 'closed_won' then 'won'
    when new.outcome = 'closed_lost' then 'lost'
    when new.outcome = 'not_interested' then 'disqualified'
    when new.outcome in ('connected','left_voicemail','no_answer','follow_up_needed') then 'contacted'
    else null
  end;

  update facilities
  set ai_last_contact_at = new.interaction_date,
      ai_outreach_status = coalesce(v_new_status, ai_outreach_status),
      ai_outreach_status_changed_at = case
        when v_new_status is not null and v_new_status != ai_outreach_status then now()
        else ai_outreach_status_changed_at
      end
  where id = new.facility_id;
  return new;
end; $$ language plpgsql;

create trigger call_note_ai_rollup after insert on call_notes
  for each row execute function trg_rollup_ai_outreach();
```

### 3.6 Priority scoring

Add a Postgres function or scheduled job that updates `ai_priority` based on:
- `hot`: demo done or proposal sent in last 14 days
- `warm`: contacted in last 30 days, no demo yet
- `cold`: qualified (`size_class in ('confirmed_100_plus','likely_100_plus')`) but never contacted
- `dead`: disqualified or lost

```sql
create or replace function recompute_ai_priorities() returns void language sql as $$
  update facilities set ai_priority = case
    when ai_outreach_status in ('demo_done','proposal_sent','negotiating')
      and ai_last_contact_at > now() - interval '14 days' then 'hot'
    when ai_outreach_status = 'contacted'
      and ai_last_contact_at > now() - interval '30 days' then 'warm'
    when ai_outreach_status = 'not_contacted'
      and size_class in ('confirmed_100_plus','likely_100_plus') then 'cold'
    when ai_outreach_status in ('disqualified','lost') then 'dead'
    else ai_priority
  end;
$$;
```

### 3.7 Acceptance criteria

- [ ] Can add multiple contacts per facility via UI
- [ ] Can log a call note with summary, outcome, AI solutions pitched, follow-up date
- [ ] `facility.ai_last_contact_at` and `ai_outreach_status` update automatically
- [ ] Follow-up dates surface in a "Follow-ups due" list sorted by date
- [ ] Priority recomputation runs nightly and populates `ai_priority` correctly

---

## Phase 4: Review Queue

### 4.1 Goal
Central place where Sagar/Dusty resolve uncertainties before Keira's monthly list goes out.

### 4.2 Reasons in queue

| Reason                       | Source                            | Resolution                                            |
| ---------------------------- | --------------------------------- | ----------------------------------------------------- |
| `unknown_size`               | classify_facility_size            | Manually research, set size_class                     |
| `conflicting_signals`        | sqft vs beds mismatch             | Decide which to trust                                 |
| `low_confidence_therapy`     | NPI medium with no name           | Web search for confirmation                           |
| `new_facility_unverified`    | DHSR found new entry              | Confirm it's IL/AL/CCRC, add to roster                |
| `stale_contact`              | Contact verified > 90 days ago    | Re-verify or remove                                   |
| `pt_provider_change`         | Monthly diff shows PT change      | Confirm if WakeMed left, new contract signed, etc     |

### 4.3 UI

Single page at `/review`. List of open items grouped by facility:
- Facility name + current size_class + ai_outreach_status
- Reason badge
- Evidence summary (inline)
- Actions: `Approve`, `Reject`, `Defer`, `Override`
- Link to facility detail

### 4.4 Acceptance criteria

- [ ] All `unknown` and `possible_100_plus` facilities surface in queue
- [ ] Approving sets size manually, removes from queue
- [ ] Rejecting marks facility `disqualified`
- [ ] Resolution captured in `review_queue.resolution_notes` + `audit_log`

---

## Phase 5: Monthly Cron + Snapshot Diffing

### 5.1 Cron schedule

```sql
select cron.schedule(
  'monthly-facility-refresh',
  '0 3 1 * *',                              -- 03:00 UTC on the 1st of each month
  $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/run-monthly-refresh',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('run_type', 'full_refresh')
  );
  $$
);

-- Nightly: recompute AI priorities
select cron.schedule('nightly-ai-priorities', '0 8 * * *', 'select recompute_ai_priorities();');
```

### 5.2 Edge Function: `run-monthly-refresh`

1. Insert `monthly_runs` row, status=`running`.
2. For each facility (sequential, 1 sec backoff):
   a. Snapshot current state into `facility_snapshots`.
   b. `enrich-parcel` → updates property data.
   c. `enrich-therapy-provider` → updates PT matches.
   d. `enrich-facility-site` → upgrades confidence where possible.
   e. `classify_facility_size(facility_id)`.
3. Run `import-dhsr` once globally.
4. Mark PT matches as `is_current=false` if not observed this run (they may have moved out).
5. Compute diffs per facility.
6. Update `monthly_runs` totals.
7. Trigger `generate-report` for Product A (Keira).

**Total run time:** ~5-10 min for 30 facilities.

### 5.3 Diff detection

```sql
create or replace function facility_diff_since_last(p_facility_id uuid)
returns jsonb language plpgsql as $$
declare
  v_prev jsonb;
  v_curr jsonb;
  v_diff jsonb := '{}'::jsonb;
begin
  select snapshot_data into v_prev
  from facility_snapshots
  where facility_id = p_facility_id
  order by created_at desc offset 1 limit 1;

  select to_jsonb(f) into v_curr from facilities f where id = p_facility_id;

  if v_prev->>'size_class' is distinct from v_curr->>'size_class' then
    v_diff := v_diff || jsonb_build_object('size_class',
      jsonb_build_object('from', v_prev->>'size_class', 'to', v_curr->>'size_class'));
  end if;
  if v_prev->>'ai_outreach_status' is distinct from v_curr->>'ai_outreach_status' then
    v_diff := v_diff || jsonb_build_object('ai_outreach_status',
      jsonb_build_object('from', v_prev->>'ai_outreach_status', 'to', v_curr->>'ai_outreach_status'));
  end if;
  -- repeat for unit_count, licensed_beds, etc

  return v_diff;
end; $$;
```

### 5.4 Acceptance criteria

- [ ] Cron fires monthly, refresh completes <15 min
- [ ] Failures captured in `monthly_runs.errors` jsonb
- [ ] Snapshots accumulate one per facility per run
- [ ] PT provider changes (new arrivals, departures) detected and surfaced
- [ ] Manual "Run now" button in UI calls the same function

---

## Phase 6: Reporting — Keira's Monthly AI Sales Report

### 6.1 Goal
Auto-generated monthly email to Keira summarizing AI sales pipeline state and changes.

**No report is generated for Product B (PT intel).** That's a dashboard, not a report — Sagar/Dusty look at it when they want to.

### 6.2 Edge Function: `generate-report`

Output:

```ts
{
  report_month: "2026-06",
  generated_at: "2026-06-01T03:15:00Z",
  product: "field_elevate_ai",
  summary: {
    total_facilities: 30,
    qualified_leads: 14,           // confirmed + likely 100+
    hot: 2,
    warm: 5,
    cold: 7,
    dead: 6,
    follow_ups_due_this_week: 3,
    demos_scheduled: 1,
  },
  changes_since_last_month: {
    new_facilities: [...],
    promoted: [{name, from, to}],
    demoted: [...],
    status_changes: [{name, from, to}],
  },
  priority_outreach: [
    // top 5 cold-qualified facilities, sorted by unit_count desc
    {name, city, units, suggested_next_step}
  ],
  follow_ups_due: [
    {facility, contact, when, summary}
  ],
  full_list_url: "...",
  csv_attachment_url: "...",         // signed Supabase Storage URL
}
```

### 6.3 PDF generation

Build report as HTML at `/reports/[run_id]`, print to PDF via Puppeteer (recommended) or `@react-pdf/renderer`. 1 PDF/month, cost negligible.

### 6.4 Email delivery via Resend

```ts
import { Resend } from 'resend';
const resend = new Resend(Deno.env.get('RESEND_API_KEY'));

await resend.emails.send({
  from: 'Field Elevate Intel <intel@fieldelevate.com>',
  to: ['keira@fieldelevate.com'],
  cc: ['dusty@fieldelevate.com', 'sagar@fieldelevate.com'],
  subject: `Wake AI Sales — ${monthLabel} update`,
  html: htmlBody,
  attachments: [{
    filename: `wake-ai-sales-${monthLabel}.pdf`,
    content: pdfBuffer
  }],
});
```

### 6.5 CSV export

`/api/exports/sales-pipeline.csv`:

```
facility_name, address, city, operator, facility_type,
size_class, unit_count, licensed_beds, building_sqft,
ai_priority, ai_outreach_status, ai_last_contact_at,
ai_estimated_deal_size, ai_current_software, ai_pain_points,
primary_contact_name, primary_contact_title, primary_contact_phone, primary_contact_email,
notes_count, last_call_summary, next_follow_up, evidence_urls
```

Separate export for Product B at `/api/exports/pt-intel.csv`:

```
facility_name, address, city, size_class, unit_count,
pt_market_status, confirmed_pt_providers, pt_provider_count,
last_observed_at, evidence_urls
```

### 6.6 Acceptance criteria

- [ ] Monthly email lands in Keira's inbox on the 1st of each month
- [ ] PDF includes summary stats, top 5 priority cold leads, changes since last month
- [ ] Sales CSV downloadable from UI and via signed URL
- [ ] PT intel CSV separately downloadable
- [ ] "Generate report now" button works on demand

---

## Phase 7: Frontend — Two Dashboards

### 7.1 Goal
One Next.js app with two distinct dashboard routes:
- `/` → Product A sales dashboard (Keira's daily workspace)
- `/pt-intel` → Product B intel dashboard (Sagar/Dusty's strategic view)

Plus supporting routes (facility detail, review queue, follow-ups, reports).

### 7.2 Routes

| Path                            | Purpose                                          | Primary user |
| ------------------------------- | ------------------------------------------------ | ------------ |
| `/`                             | AI sales dashboard (table + detail panel)        | Keira        |
| `/facility/[id]`                | Full facility profile                            | Keira        |
| `/review`                       | Review queue                                     | Sagar/Dusty  |
| `/follow-ups`                   | Calls due today/this week                        | Keira        |
| `/reports`                      | Past monthly AI sales reports                    | All          |
| `/reports/[run_id]`             | Single report (printable)                        | All          |
| `/pt-intel`                     | PT market intel dashboard                        | Sagar/Dusty  |
| `/pt-intel/providers/[id]`      | Single PT provider drill-down                    | Sagar/Dusty  |
| `/pt-intel/facilities/[id]`     | PT view of a single facility                     | Sagar/Dusty  |
| `/settings`                     | Users, integrations                              | Sagar        |

### 7.3 Product A: Sales dashboard layout (`/`)

Matches the demo artifact.

- **Top bar:** Logo · "Last sync" · "Run monthly update" · "Generate report"
- **Stats strip:** Total · Confirmed 100+ · Qualified · Hot · Warm · Follow-ups due
- **Left pane (flex-1):** Filter tabs (All / Qualified / Hot / Cold / Review) · search · table with size dot, units, AI priority, primary contact, last contact, AI outreach status
- **Right pane (420px):** Facility detail — size + evidence, **primary contact card** (manager + phone + email), call notes timeline, "Log call" button, AI pipeline status, deal size estimate
- **Therapy provider info shown but de-emphasized** — small badge, not a primary signal

### 7.4 Product B: PT intel dashboard layout (`/pt-intel`)

A completely different lens — no CRM, no outreach, no editing UI. Read-only strategic view.

**Layout:**

- **Top bar:** "Wake County PT Market" · last refresh date · CSV export
- **KPI strip:**
  - Total qualified facilities tracked
  - Facilities with confirmed PT provider
  - Facilities with **no NPI-registered PT** (open market)
  - Active PT providers in Wake senior living
- **Main grid (two columns):**
  - **Left: Facilities by PT status** — table from `v_facility_pt_summary`:
    - Facility name, size class, unit count
    - PT market status (badge): `open_market` (green) · `single_incumbent` (amber) · `multi_provider` (red)
    - List of confirmed PT providers
    - Last observed date
    - Filter by status, size class
  - **Right: PT provider footprint** — table from `v_pt_provider_footprint`:
    - Provider org name
    - Parent organization (e.g. WakeMed)
    - Active facility count
    - Qualified facility count
    - Last observed
    - Click → `/pt-intel/providers/[id]` for drill-down

### 7.5 PT provider drill-down (`/pt-intel/providers/[id]`)

- Provider profile: org name, NPI, taxonomy, parent
- Map of all Wake senior living facilities they're at
- Table of facilities with: size class, unit count, match confidence, evidence URL, last observed
- Historical: when first observed, monthly observation timeline

### 7.6 Components to build

Shared:
- `<FacilityTable />`, `<FacilityDetailPanel />`, `<SizeBadge />`

Product A:
- `<ContactCard />`, `<CallNoteForm />`, `<CallNotesTimeline />`, `<AIPipelineBadge />`, `<MonthlyReportModal />`, `<FollowUpList />`

Product B:
- `<PTMarketStatusBadge />`, `<PTProviderTable />`, `<FacilityPTSummaryTable />`, `<PTProviderProfile />`, `<PTFacilityMap />`

### 7.7 Auth

Supabase Auth magic link. Whitelist: sagar, dusty, keira, +1-2 spares.

Optionally: role flag in user metadata to hide `/pt-intel` from Keira if it's distracting (default: everyone sees both, simpler).

### 7.8 Acceptance criteria

- [ ] `/` matches demo artifact visual fidelity
- [ ] `/pt-intel` is clearly a separate dashboard (different color accent or top-bar treatment so users know they're in a different product)
- [ ] PT intel dashboard has zero editing UI — read-only
- [ ] Both CSVs exportable from their respective dashboards
- [ ] Mobile-responsive (single column collapse)

---

## Phase 8: Deployment, Manual Contact Sprint, Handoff

### 8.1 Deployment

- **Database/Functions:** Supabase (hosted)
- **Frontend:** Vercel
- **Domain:** e.g. `wake-intel.fieldelevate.com`
- **Secrets:** Supabase env + Vercel env

### 8.2 Manual contact enrichment sprint (Keira's first week)

Goal: populate primary contacts for all 30 facilities. Estimated effort: ~3 hours.

Per facility:
1. Open facility in dashboard.
2. Apollo search by facility name → grab ED name, title, email. Tag `data_source='apollo'`.
3. If Apollo missing, Google `"[Facility name]" "executive director"` → LinkedIn snippets, About pages. Tag `data_source='web_search'`.
4. If still missing, call front desk: "Who's your Executive Director, and what's the best email?" Tag `data_source='phone_call'`. Highest accuracy.
5. Set `verified_at = now()`.

Target: 30/30 facilities with ≥1 primary contact.

### 8.3 Runbook for Sagar/Dusty

`RUNBOOK.md` in repo:
- Manually trigger monthly refresh
- Add a new facility (manual entry or via DHSR discovery)
- Override a size classification
- Disqualify a facility
- Roll back a bad enrichment run
- Where logs live (Edge Function logs + `monthly_runs.errors`)
- How to interpret PT market status changes month-over-month

### 8.4 Monitoring

Minimal:
- Email Sagar if `monthly_runs.status='failed'`
- Optional Slack webhook for new facility detection or PT provider change
- Weekly summary if review queue > 10 items open

### 8.5 Final acceptance criteria

- [ ] Production deployment at agreed domain
- [ ] All 30 facilities loaded with `size_class` set
- [ ] All 30 facilities have ≥1 primary contact with `data_source` tagged
- [ ] First monthly cron fires successfully
- [ ] Keira receives email report and can log calls
- [ ] PT intel dashboard shows ≥3 PT providers with facility footprint
- [ ] Sagar + Dusty admin access; Keira standard user
- [ ] Runbook in repo
- [ ] Codex report PDF + this spec in `/docs`

---

## Appendix A: External Data Sources

| Source                  | Type           | Auth | Rate limit          | Used by    | Notes                              |
| ----------------------- | -------------- | ---- | ------------------- | ---------- | ---------------------------------- |
| NPPES NPI Registry v2.1 | REST JSON      | None | ~1/sec              | Product B  | Foundation of PT intel             |
| Wake County Open Data   | ArcGIS REST    | None | ~10/sec             | Shared     | Parcels: sqft, year, value         |
| NC DHSR ACH listings    | XLSX download  | None | Monthly             | Shared     | AL/SN only, not pure IL            |
| NC DOI CCRC list        | HTML scrape    | None | Quarterly           | Shared     | Multi-level campuses only          |
| Apollo.io               | REST           | Key  | 50/mo free          | Product A  | Contact discovery                  |
| Facility websites       | HTML scrape    | None | 1/sec/host          | Shared     | Unit count + PT mentions           |
| Resend                  | REST           | Key  | 100/day free        | Product A  | Monthly report email               |

## Appendix B: Confidence Scoring

**Size class priority:**
1. Confirmed exact count from official source → `confirmed_*`
2. Wake parcel API
3. DHSR licensed beds
4. Building sqft heuristic
5. Default `unknown` → review queue

**PT provider confidence:**
- **High**: NPI exact-address + PT taxonomy + facility-site mention OR provider's location page
- **Medium**: NPI exact-address + PT taxonomy
- **Low**: NPI within 0.5 mi OR job posting mention
- **Unknown**: no NPI match

## Appendix C: Glossary

- **IL** — Independent Living. Apartment-style, no medical care. Not state-licensed in NC.
- **AL** — Assisted Living. State-licensed via DHSR.
- **CCRC** — Continuing Care Retirement Community. Multi-level campus. Licensed by NC DOI.
- **ED** — Executive Director. The operations buyer for AI ops software.
- **CRD** — Community Relations Director. Gatekeeper.
- **NPI** — National Provider Identifier. Issued by CMS via NPPES.
- **NPPES** — National Plan and Provider Enumeration System.
- **PT/OT** — Physical Therapy / Occupational Therapy.

## Appendix D: Product A Pitch Reference

The AI solutions Field Elevate is selling into senior living (so Keira can tag calls correctly):

| Tag                      | What it is                                                |
| ------------------------ | --------------------------------------------------------- |
| `scheduling`             | AI staff scheduling + shift optimization                  |
| `intake_automation`      | Move-in / resident onboarding automation                  |
| `family_portal`          | Family communication portal with AI summaries             |
| `maintenance_triage`     | Maintenance request intake + auto-routing                 |
| `staff_comms`            | Internal staff messaging + announcements                  |
| `resident_engagement`    | Activity recommendations, engagement tracking             |
| `ops_dashboard`          | Real-time ops KPI dashboard for executive directors       |
| `other`                  | Anything else discussed                                   |

Update this list as Field Elevate's product line evolves. Stored as `text[]` in `call_notes.ai_solutions_pitched` for analytics on which products land best.

## Appendix E: Product B — Useful PT Intel Queries

Sample SQL queries the dashboard should expose as buttons/filters:

```sql
-- 1. Open-market facilities (no NPI-registered PT)
select * from v_facility_pt_summary where pt_market_status = 'open_market';

-- 2. WakeMed's senior living footprint
select * from v_pt_provider_footprint
where parent_organization = 'WakeMed Health & Hospitals';

-- 3. Facilities where a PT provider was observed last month but not this month (potential contract loss)
select f.name, tp.organization_name, ftm.first_observed_at, ftm.last_observed_at
from facility_therapy_matches ftm
join facilities f on f.id = ftm.facility_id
join therapy_providers tp on tp.id = ftm.provider_id
where ftm.is_current = false
  and ftm.last_observed_at > now() - interval '60 days';

-- 4. Top 5 PT providers by qualified facility count
select organization_name, parent_organization, qualified_facility_count
from v_pt_provider_footprint
order by qualified_facility_count desc
limit 5;

-- 5. Concentration risk — facilities with a single PT incumbent
select * from v_facility_pt_summary where pt_market_status = 'single_incumbent';
```

---

**End of spec. Questions to Sagar.**
