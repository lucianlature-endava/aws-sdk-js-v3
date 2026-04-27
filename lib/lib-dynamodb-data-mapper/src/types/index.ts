/**
 * Shared types (`SchemaDef`, `TableHandle`, local client bundle) and promoted fluent / batch / transact API types.
 * Runtime helpers live in root `schema.ts`, `table.ts`, and `client.ts`; advanced contracts live under `./api`.
 */
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
} from "./schema";
export type { ForTableOptions, TableHandle } from "./table";
export type { LocalClients } from "./clients";
export * from "./api";
