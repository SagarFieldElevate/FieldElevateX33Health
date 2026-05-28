# Wake County Senior Living — Researched Candidates

> **STATUS: RESEARCHED CANDIDATE DATA — NOT AUTHORITATIVE.**
> This roster (`researched-candidates.json`) was compiled from public web sources
> (operator websites, A Place for Mom / Seniorly / SeniorHousingNet directories,
> chamber listings, trade press) to **bootstrap** the data pipeline. It has **not**
> been verified against the official `NC_Wake_Senior_Living_Tracker_Codex_Report.pdf`
> nor against NC DHSR / NC DOI authoritative licensing records.
>
> **A human must verify each entry against the Codex report before seeding.**
> Do NOT merge this into `facilities.json` (3 human-confirmed facilities) without review.
>
> Field discipline applied:
> - `unit_count` is only present where a public source gave an explicit apartment/home count;
>   it is always marked `unit_count_type: "estimated"` (NOT "exact"), so the enrichment
>   pipeline still classifies size. No `size_class` / `size_confidence` set here.
> - The 3 already-confirmed facilities (Searstone, The Cardinal at North Hills,
>   Wakefield Manor) are intentionally **excluded** to avoid duplication.
> - Every entry has a real `source_url`. No addresses or facilities were fabricated.
> - `facility_type` uses the schema enum: IL | AL | CCRC | mixed | 55plus.

## Compiled: 28 candidate facilities

### CCRCs / Life Plan Communities (highest confidence — these are well-documented, large campuses)

| Facility | City | Confidence | Notes / sources |
|---|---|---|---|
| Springmoor Life Care Retirement Community | Raleigh | High | RLA-operated CCRC. Springmoor.org residence page states ~389 IL apts + 46 villas + 173 SNF + 18 AL — clearly 100+. Address 1500 Sawmill Rd corroborated by US News + seniorlivingguide. |
| Glenaire | Cary | High | Presbyterian Homes-operated CCRC on a 32-acre campus, 4000 Glenaire Circle. Listed in NC DOI CCRC registry. Full continuum IL/AL/SNF. Unit count not pinned to a single source so left out. |
| The Cypress of Raleigh | Raleigh | High | LCS-managed CCRC, 205 residences on 44 acres, 8801 Cypress Lakes Dr. Corroborated by seniorly + NC DOI disclosure statement. |
| The Oaks at Whitaker Glen | Raleigh | Medium-High | CCRC in Hayes Barton, 501 E Whitaker Mill Rd, three 4-story atrium buildings. Operator left as Independent (not confirmed). |
| The Templeton of Cary | Cary | High | Liberty Senior Living / Brightmore brand, 215 Brightmore Dr; companion Swift Creek Health Center at 221 Brightmore (AL/MC/SNF). Full continuum. |
| Windsor Point Retirement Community | Fuquay-Varina | High | CCRC, 1221 Broad St, 181 cottages/apartments per multiple directories. Full continuum. |

### 55+ Active Adult

| Facility | City | Confidence | Notes / sources |
|---|---|---|---|
| Carolina Preserve by Del Webb | Cary | High | Del Webb 55+ community, 107 Arvind Oaks Circle, 1,360 homes per carolinapreserve.com/about. Very large but note: this is age-restricted for-sale housing, NOT licensed senior care — flagged as `55plus` for reviewer to decide relevance. |

### Independent Living (and IL-led mixed)

| Facility | City | Confidence | Notes / sources |
|---|---|---|---|
| Brookdale North Raleigh | Raleigh | High | Brookdale IL, 1200 Carlos Dr 27609 — confirmed directly on operator site. |
| Modena Cary | Cary | High | Formerly **Atria Cary**; rebranded after Solera Senior Living acquired it (Apr 2026, $60.28M, 138 units per crenews trade press). 7000 Regency Pkwy. Name updated to current. |
| Atria Oakridge | Raleigh | Medium-High | Atria IL, 10810 Sandy Oak Lane 27614 (A Place for Mom). |
| Waltonwood Cary Parkway | Cary | High | Singh/Waltonwood, IL + AL + MC (mixed), 750 SE Cary Pkwy, opened 2010. |
| Waltonwood Lake Boone | Raleigh | Medium | Singh/Waltonwood, 3550 Horton St 27607 (A Place for Mom Wake County list). Address corroborated by directory only. |
| The Willows at Raleigh | Raleigh | High | Solera-operated IL (Focus Healthcare owns), 2722 Spring Forest Rd 27616. |
| Independence Village of Olde Raleigh | Raleigh | Medium-High | Sonida Senior Living IL, 3113 Charles B. Root Wynd 27612. |
| Stoneridge | Cary | Medium | Hawthorn Senior Living IL, 105 Convention Dr 27511 (A Place for Mom). |
| Capital Oaks Retirement Resort | Raleigh | Medium | IL, 6498 Ray Rd 27613 (A Place for Mom Wake County list). Operator "Holiday by Atria" inferred from resort branding — verify. |
| Abbotswood at Stonehenge | Raleigh | Medium | IL, 7900 Creedmoor Rd 27613 (A Place for Mom). Operator unconfirmed. |
| Gardens at Wakefield | Raleigh | Medium | IL, 12800 Spruce Tree Way 27614 (A Place for Mom). Operator unconfirmed. |
| Preston Pointe | Morrisville | Medium | IL, 1995 NW Cary Pkwy 27560 (A Place for Mom). Operator unconfirmed. |
| Brier Pointe Retirement Community | Morrisville | Medium | IL, 5911 McCrimmon Pkwy 27560 (A Place for Mom). Operator unconfirmed. |

### Mixed (IL + AL)

| Facility | City | Confidence | Notes / sources |
|---|---|---|---|
| Magnolia Glen | Raleigh | Medium-High | IL + AL on 12 wooded acres, 5301 Creedmoor Rd 27612. Operator listed as Kisco in some directories — flagged, verify. (Note: continuingcarecommunities list shows 5215 Creedmoor; A Place for Mom shows 5301 — used 5301, the operator-aligned address. Verify exact number.) |
| The Cambridge at Brier Creek | Raleigh | Medium-High | Cambridge Village / CVS Living, IL + AL + on-site care, 7901 TW Alexander Dr 27617. |

### Assisted Living (larger AL communities; size likely 100+ but not confirmed)

| Facility | City | Confidence | Notes / sources |
|---|---|---|---|
| Sunrise at North Hills | Raleigh | High | Sunrise Senior Living AL/MC, 615 Spring Forest Rd 27609 — confirmed on operator site. Directories cite ~160 capacity (not used as unit_count — capacity != units). |
| Sunrise of Raleigh | Raleigh | Medium | Sunrise AL, 4801 Edwards Mill Rd 27612 (Wake County directory + operator site). |
| Cadence North Raleigh | Raleigh | Medium-High | Cogir Senior Living AL + memory care, 5219 Old Wake Forest Rd 27609. Note: a directory cited 96 units (under 100) — left unit_count OUT so pipeline classifies; INCLUDED as a candidate but flag for size review. |
| Elmcroft of Northridge | Raleigh | Medium | Large AL, 600 Newton Rd 27615. Directories cite ~161 AL units — promising for 100+ but the count source was a search summary, not a primary page, so left out pending verification. |
| The Covington | Raleigh | Medium | AL, 4510 Duraleigh Rd 27612. Directory cites ~120-apartment capacity. |
| Heartfields at Cary | Cary | Medium | AL, 1050 Crescent Green Dr 27518. Directory cites ~97 capacity (possibly under 100) — flag for size review. |

## Notable gaps & uncertainty

- **Operators marked "Independent" are placeholders** where no operator could be confirmed
  from a citable source (Elmcroft of Northridge, The Covington, Heartfields, Abbotswood,
  Gardens at Wakefield, Preston Pointe, Brier Pointe, Whitaker Glen). Verify before relying on these.
- **Size (100+) is NOT confirmed** for most AL communities and several IL communities. Several
  directory hints suggest some AL communities (Cadence 96, Heartfields ~97) may fall UNDER 100
  units — they are kept as candidates but explicitly flagged. The enrichment pipeline / Codex
  report should resolve true size.
- **Capacity vs. unit count**: directory "capacity" / "resident" numbers (Sunrise ~160,
  Covington ~120) were deliberately NOT recorded as `unit_count`, since bed/resident capacity
  is not the same as apartment/unit count.
- **Carolina Preserve** is age-restricted for-sale housing, not a licensed care community —
  included as `55plus` per the brief's allowed types, but reviewer should decide if it fits the
  facility universe.
- **Address conflicts to resolve**: Magnolia Glen appears as both 5215 and 5301 Creedmoor Rd
  across sources; used 5301.
- **Not yet researched / possible additions** for the human pass: Brighton Gardens of Raleigh,
  Morningside of Raleigh, Spring Arbor of Raleigh/Apex, Woodland Terrace (Cary), Overture
  Crabtree/Centennial (55+ apartments), Treeo Raleigh, Jordan Oaks, Whispering Pines,
  The Cardinal-adjacent Kisco properties. These surfaced in directories but were not
  individually corroborated within scope.
- **Authoritative cross-check pending**: none of these were checked against the NC DHSR
  Adult Care / SCU licensing list (info.ncdhhs.gov/dhsr/acls/pdf/sculist.pdf) or the
  NC DOI CCRC registry (apps.ncdoi.net) — recommended next step for the verification pass.

## Primary source pages consulted

- A Place for Mom — Wake County independent living: https://www.aplaceformom.com/independent-living/north-carolina/wake-county
- ContinuingCareCommunities.org — Wake County: https://www.continuingcarecommunities.org/assisted-living/north-carolina/wake-county.html
- Operator sites: brookdale.com, sunriseseniorliving.com, atriaseniorliving.com, waltonwood.com,
  modenacary.com, willowsatraleigh.com, springmoor.org, glenaire.org, thecypressofraleigh.com,
  thetempletonofcary.com, windsorpoint.com, carolinapreserve.com, cogirusa.com, cvsliving.com,
  sonidaseniorliving.com, oaksatwhitakerglen.com
- Trade press: crenews.com (Solera / Atria Cary acquisition)
- NC DOI CCRC registry: https://apps.ncdoi.net/f?p=109:100 (referenced, not yet line-item verified)
- NC DHSR SCU list: https://info.ncdhhs.gov/dhsr/acls/pdf/sculist.pdf (referenced, not yet line-item verified)
