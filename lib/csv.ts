/** Minimal RFC 4180 parser: quoted fields, escaped quotes, CRLF or LF */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

export interface SchemaCheck {
  ok: boolean;
  missing: string[];
  rows: Record<string, string>[];
}

export function checkSchema(text: string, required: string[]): SchemaCheck {
  const table = parseCsv(text);
  if (!table.length) return { ok: false, missing: required, rows: [] };
  const header = table[0].map((h) => h.trim().toLowerCase());
  const missing = required.filter((c) => !header.includes(c));
  const rows = table.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
  return { ok: missing.length === 0, missing, rows };
}
