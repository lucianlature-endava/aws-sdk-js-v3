import type {
  RowShape,
  SchemaDef,
} from "../schema";

/** Primary or named secondary index usable in typed query signatures. */
export type QueryableIndexName<S extends SchemaDef> =
  | "primary"
  | keyof NonNullable<S["indexes"]["gsi"]>
  | keyof NonNullable<S["indexes"]["lsi"]>;

type GsiOf<S extends SchemaDef> = NonNullable<S["indexes"]["gsi"]>;
type LsiOf<S extends SchemaDef> = NonNullable<S["indexes"]["lsi"]>;

/**
 * Resolved primary or secondary index key layout for type-level query helpers.
 * LSIs reuse the table’s partition key definition; GSIs use their own `pk`/`sk` fields from the schema.
 */
export type EffectiveIndexKeys<S extends SchemaDef, I extends QueryableIndexName<S>> = I extends "primary"
  ? S["indexes"]["primary"]
  : I extends keyof GsiOf<S>
  ? GsiOf<S>[I & keyof GsiOf<S>]
  : I extends keyof LsiOf<S>
  ? { pk: S["indexes"]["primary"]["pk"]; sk: LsiOf<S>[I & keyof LsiOf<S>]["sk"] }
  : never;

/** Attribute names that feed the partition key for index `I`. */
export type IndexPkComposite<
  S extends SchemaDef,
  I extends QueryableIndexName<S>
> = EffectiveIndexKeys<S, I> extends { pk: { composite: infer C extends readonly string[] } } ? C[number] : never;

/** Partition-key attributes accepted for `query` on index `I` (equality on hash key). */
export type QueryPartitionInput<S extends SchemaDef, I extends QueryableIndexName<S>> = Pick<
  RowShape<S["attributes"]>,
  IndexPkComposite<S, I>
>;
