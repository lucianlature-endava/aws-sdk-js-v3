/**
 * Schema definition helpers and **logical → physical** primary-key mapping.
 *
 * `indexes.primary` describes how application attributes (`attributes`) map onto the
 * DynamoDB key attributes named by `pk.field` / `sk.field`. Each side’s `composite`
 * lists which logical fields participate, in order; values are stored as **one**
 * string per key attribute by joining with `#` (single-table style).
 */
import type { AttributeDef, SchemaDef } from "./types/index";

export type {
  AttributeKey,
  AttrType,
  AttributeDef,
  GlobalSecondaryIndexDef,
  IndexField,
  KeyInput,
  LocalSecondaryIndexDef,
  PrimaryIndex,
  PrimaryIndexLinked,
  RowShape,
  SchemaDef,
  SchemaDefLinked,
} from "./types/index";

/**
 * Returns the schema unchanged. Use for inference; optional at runtime.
 * Prefer `satisfies SchemaDefLinked<typeof attrs>` on a const object for stricter composite keys.
 */
export function defineSchema<A extends Record<string, AttributeDef>>(def: SchemaDef<A>) {
  return def;
}

/**
 * Partition key **value** only: each `indexes.primary.pk.composite` field is read from `part`,
 * stringified, joined with `#`. Matches the value used in {@link physicalKeyFromRow} and in `query` key conditions.
 */
export function partitionKeyValueFromRow(schema: SchemaDef, part: Record<string, unknown>): string {
  const { primary } = schema.indexes;
  return primary.pk.composite.map((k) => String(part[k])).join("#");
}

/**
 * Builds the DynamoDB **primary key map** for Put/Get/Delete/Update: one entry per
 * `pk.field` and `sk.field`, values derived from `row` using each side’s `composite` order and `#` joins.
 */
export function physicalKeyFromRow(schema: SchemaDef, row: Record<string, unknown>): Record<string, string> {
  const { primary } = schema.indexes;
  const pkVal = partitionKeyValueFromRow(schema, row);
  const skVal = primary.sk.composite.map((k) => String(row[k])).join("#");

  return {
    [primary.pk.field]: pkVal,
    [primary.sk.field]: skVal,
  };
}

/** Same as {@link physicalKeyFromRow}; use when the input is key components only (naming clarity). */
export function physicalKeyFromParts(schema: SchemaDef, parts: Record<string, unknown>): Record<string, string> {
  return physicalKeyFromRow(schema, parts);
}
