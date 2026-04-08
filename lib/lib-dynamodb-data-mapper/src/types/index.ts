/**
 * Shared types (`SchemaDef`, `TableHandle`, local client bundle).
 * Implementation lives in `schema.ts`, `table.ts`, and `client.ts` at the package root `src/`.
 */
export type {
  AttributeKey,
  AttrType,
  AttributeDef,
  IndexField,
  KeyInput,
  PrimaryIndex,
  PrimaryIndexLinked,
  RowShape,
  SchemaDef,
  SchemaDefLinked,
} from "./schema";
export type { ForTableOptions, TableHandle } from "./table";
export type { LocalClients } from "./clients";
