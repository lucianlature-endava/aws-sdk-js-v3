/** Scalar types supported on the application row shape for this library. */
export type AttrType = "string" | "number" | "boolean";

/** One field in `SchemaDef.attributes`. */
export interface AttributeDef {
  type: AttrType;
  /** Reserved for optimistic locking; not enforced yet. */
  versionAttribute?: boolean;
}

/**
 * One leg of a primary key (partition or sort): the **DynamoDB attribute name** plus which
 * **logical** attributes feed it, in order. Values are joined with `#` into that single stored attribute.
 */
export interface IndexField {
  /** Physical attribute name on the item (e.g. `"pk"`, `"sk"`). */
  field: string;
  /** Application attribute names, in order, that compose this key. */
  composite: readonly string[];
}

/** Primary key definition: hash + range, each an {@link IndexField}. */
export interface PrimaryIndex {
  pk: IndexField;
  sk: IndexField;
}

/**
 * Global secondary index: own partition + sort key fields (logical → physical like primary).
 * `indexName` is the DynamoDB `IndexName` sent on Query/Scan.
 */
export interface GlobalSecondaryIndexDef {
  indexName: string;
  pk: IndexField;
  sk: IndexField;
}

/**
 * Local secondary index: shares the table’s partition key; alternate sort key field.
 * `indexName` is the DynamoDB `IndexName` on Query.
 */
export interface LocalSecondaryIndexDef {
  indexName: string;
  sk: IndexField;
}

/**
 * Full table schema: application `attributes` plus key indexes.
 * Secondary indexes are **type-level** for API design; runtime mapping may not implement them yet.
 */
export interface SchemaDef<A extends Record<string, AttributeDef> = Record<string, AttributeDef>> {
  attributes: A;
  indexes: {
    primary: PrimaryIndex;
    /** Named GSIs (keys are stable API names, e.g. `byEmail`). */
    gsi?: Record<string, GlobalSecondaryIndexDef>;
    /** Named LSIs (keys are stable API names). */
    lsi?: Record<string, LocalSecondaryIndexDef>;
  };
}

/** In-memory / API shape for one item, derived from `attributes` defs. */
export type RowShape<A extends Record<string, AttributeDef>> = {
  [K in keyof A]: A[K]["type"] extends "string" ? string : A[K]["type"] extends "number" ? number : boolean;
};

/**
 * Minimal object accepted for **GetItem** / **DeleteItem** / **UpdateItem** keys:
 * all attributes that appear in either `pk.composite` or `sk.composite`.
 */
export type KeyInput<A extends Record<string, AttributeDef>, P extends PrimaryIndex> = Pick<
  RowShape<A>,
  P["pk"]["composite"][number] | P["sk"]["composite"][number]
>;

/** Attribute name keys (strings only) for a given attributes map. */
export type AttributeKey<A extends Record<string, AttributeDef>> = Extract<keyof A, string>;

/** Stricter primary index: every `composite` entry must be a key of `attributes`. */
export interface PrimaryIndexLinked<A extends Record<string, AttributeDef>> {
  pk: { field: string; composite: readonly AttributeKey<A>[] };
  sk: { field: string; composite: readonly AttributeKey<A>[] };
}

/**
 * Schema paired with a concrete `attributes` object; use
 * `const x = { ... } satisfies SchemaDefLinked<typeof attrs>` to catch typos in `composite`.
 */
export type SchemaDefLinked<A extends Record<string, AttributeDef>> = {
  attributes: A;
  indexes: {
    primary: PrimaryIndexLinked<A>;
    gsi?: Record<string, GlobalSecondaryIndexDef>;
    lsi?: Record<string, LocalSecondaryIndexDef>;
  };
};
