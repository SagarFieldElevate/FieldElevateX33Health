// Minimal RFC-4180-ish CSV serializer.
export function toCsvValue(value: unknown): string {
  if (value == null) return "";
  let s: string;
  if (Array.isArray(value)) {
    s = value.filter((v) => v != null && v !== "").join("; ");
  } else if (value instanceof Date) {
    s = value.toISOString();
  } else {
    s = String(value);
  }
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function rowsToCsv(
  headers: string[],
  rows: Array<Array<unknown>>,
): string {
  const lines = [headers.map(toCsvValue).join(",")];
  for (const row of rows) {
    lines.push(row.map(toCsvValue).join(","));
  }
  // Leading line-break stripped; CRLF line endings for Excel friendliness.
  return lines.join("\r\n");
}

export function csvResponse(filename: string, body: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
