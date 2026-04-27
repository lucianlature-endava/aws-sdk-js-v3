/**
 * Size-targeted row builder adapted from **`JavaScript-csm`** `src/utils/itemFactory.ts`:
 * UTF-8 byte budget across attribute keys + string/number values, with **`body`** absorbing the remainder.
 *
 * Used by **`minimal-query-bench.ts`** so payloads can match ~4 KB (**small**) or ~400 KB (**large**) totals.
 */
import { randomBytes } from "node:crypto";

import type { UserTableRow } from "./user-table-schema";

/** Same numeric targets as CSM `SIZE_PRESETS` (excluding `Tiny` / `Medium` there). */
export const SIZE_PRESETS = {
  Small: 4_000,
  Large: 400_000,
} as const;

const encoder = new TextEncoder();

export type PayloadPreset = "minimal" | "small" | "large";

export function parsePayloadPreset(argv = process.argv, env = process.env): PayloadPreset {
  const arg = argv.find((a) => a.startsWith("--payload="))?.slice("--payload=".length).trim().toLowerCase();
  const raw = arg || env.MINIMAL_QUERY_PAYLOAD?.trim().toLowerCase() || "minimal";
  if (raw === "minimal" || raw === "tiny") return "minimal";
  if (raw === "small") return "small";
  if (raw === "large") return "large";
  return "minimal";
}

export function generateUtf8String(targetBytes: number): string {
  if (targetBytes <= 0) return "";
  return randomBytes(targetBytes).toString("base64").slice(0, targetBytes);
}

function utf8EntryBytes(key: string, value: unknown): number {
  return encoder.encode(key).length + encoder.encode(value == null ? "" : String(value)).length;
}

function totalUtf8Bytes(item: Record<string, unknown>): number {
  return Object.entries(item).reduce((sum, [k, v]) => sum + utf8EntryBytes(k, v), 0);
}

/**
 * How many UTF-8 bytes **`body`** should occupy so **sum(key + value UTF-8)** is about **`targetTotal`**
 * (fixed fields + empty `body` counted first), matching the CSM **`computeBodyByteSize`** idea.
 */
export function computeBodyUtf8Budget(targetTotal: number, baseWithoutBody: Record<string, unknown>): number {
  const withEmptyBody = { ...baseWithoutBody, body: "" };
  return Math.max(0, targetTotal - totalUtf8Bytes(withEmptyBody));
}

/** Fills **`body`** for a user-table row according to **`preset`**. */
export function applyPayloadToUserRow(base: Omit<UserTableRow, "body">, preset: PayloadPreset): UserTableRow {
  if (preset === "minimal") return { ...base, body: "" };
  const target = preset === "small" ? SIZE_PRESETS.Small : SIZE_PRESETS.Large;
  const bodyLen = computeBodyUtf8Budget(target, { ...base });
  return { ...base, body: generateUtf8String(bodyLen) };
}
