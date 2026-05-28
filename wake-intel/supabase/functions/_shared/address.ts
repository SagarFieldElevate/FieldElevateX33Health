// Address helpers shared by enrich-parcel and enrich-therapy-provider.

const STREET_ABBR: Record<string, string> = {
  street: "st",
  avenue: "ave",
  boulevard: "blvd",
  drive: "dr",
  road: "rd",
  lane: "ln",
  court: "ct",
  circle: "cir",
  place: "pl",
  parkway: "pkwy",
  highway: "hwy",
  terrace: "ter",
  trail: "trl",
  north: "n",
  south: "s",
  east: "e",
  west: "w",
};

// Normalize for fuzzy comparison: lowercase, strip suite/unit suffixes,
// collapse whitespace/punctuation, canonicalize common street words.
export function normalizeAddress(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = raw.toLowerCase();
  // drop suite / unit / apt / # designators and everything after
  s = s.replace(/\b(ste|suite|unit|apt|apartment|#|bldg|building)\b.*$/i, "");
  s = s.replace(/[.,]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  s = s
    .split(" ")
    .map((w) => STREET_ABBR[w] ?? w)
    .join(" ");
  return s;
}

// True when two addresses share the same leading house number and at least
// the first street-name token after it.
export function addressesMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const na = normalizeAddress(a);
  const nb = normalizeAddress(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ta = na.split(" ");
  const tb = nb.split(" ");
  // require same house number + shared street-name token
  if (ta[0] !== tb[0]) return false;
  const streetA = new Set(ta.slice(1, 3));
  return tb.slice(1, 3).some((t) => streetA.has(t));
}

// Escape a value for an ArcGIS SQL WHERE clause (single quotes).
export function sqlEscape(value: string): string {
  return value.replace(/'/g, "''");
}
