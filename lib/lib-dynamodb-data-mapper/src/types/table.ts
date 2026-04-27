import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

import type { KeyInput, RowShape, SchemaDef } from "./schema";

/** Options passed when binding a schema to the document client (region, credentials, middleware all live on `client`). */
export interface ForTableOptions {
  /**
   * Shared `DynamoDBDocumentClient`; the mapper only calls `.send(...)` on commands it constructs.
   * Use the same client instance your app uses elsewhere so retries, logging, and tracing stay consistent.
   */
  client: DynamoDBDocumentClient;
}

/**
 * Typed operations for one table + schema. All methods use the schema’s stored `pk`/`sk` names
 * on the wire and `RowShape` / `KeyInput` at the type level.
 */
export type TableHandle<S extends SchemaDef> = {
  /** Put full row; physical keys are computed and merged into the item. */
  put(item: RowShape<S["attributes"]>): Promise<void>;
  /** Get by primary key; returns `undefined` if missing. Strips physical key attrs from the result. */
  get(key: KeyInput<S["attributes"], S["indexes"]["primary"]>): Promise<RowShape<S["attributes"]> | undefined>;
  /**
   * `SET` updates only; no conditions. Cannot change key attributes named in the schema.
   * No-op if `opts.set` is empty.
   */
  update(
    key: KeyInput<S["attributes"], S["indexes"]["primary"]>,
    opts: { set: Partial<RowShape<S["attributes"]>> }
  ): Promise<void>;
  delete(key: KeyInput<S["attributes"], S["indexes"]["primary"]>): Promise<void>;
  /**
   * Query on partition key equality only (`#pk = :pk`). Supply every attribute in `pk.composite`.
   * Does not set `IndexName` (base table only).
   */
  query(
    partition: Pick<RowShape<S["attributes"]>, S["indexes"]["primary"]["pk"]["composite"][number]>
  ): Promise<RowShape<S["attributes"]>[]>;
};
