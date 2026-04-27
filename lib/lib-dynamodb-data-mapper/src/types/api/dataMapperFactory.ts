import type { SchemaDef } from "../schema";
import type { ForTableOptions } from "../table";
import type {
  BatchGetLine,
  BatchGetMultiCommand,
  BatchWriteMultiCommand,
  BatchWriteMultiInput,
  TableSchemaRegistry,
} from "./batchMulti";
import type { TableHandleApi } from "./tableHandleApi";
import type {
  TransactGetMultiCommand,
  TransactGetMultiLine,
  TransactWriteMultiCommand,
  TransactWriteMultiInput,
} from "./transactMulti";

/**
 * Map of **entity name** → `SchemaDef` for a single DynamoDB table (single-table design: multiple item shapes).
 * Keys are stable handles used by `forEntities` at the type level.
 */
export type EntityMap = Record<string, SchemaDef>;

/** Configuration for `forEntities`: which logical entities (schemas) share the bound `tableName`. */
export interface ForEntitiesOptions<E extends EntityMap> {
  entities: E;
}

/** One {@link TableHandleApi} per entity in `E`, all targeting the same physical table. */
export type MultiEntityTableHandle<E extends EntityMap> = {
  [K in keyof E]: TableHandleApi<E[K]>;
};

/**
 * Top-level factory: per-table handles, multi-entity binding, and multi-table batch/transact builders.
 * Concrete implementations may lag this interface; treat as the intended public contract for advanced APIs.
 */
export interface DataMapperFactory {
  forTable<S extends SchemaDef>(tableName: string, schema: S, options: ForTableOptions): TableHandleApi<S>;

  forEntities<E extends EntityMap>(
    tableName: string,
    config: ForEntitiesOptions<E>,
    options: ForTableOptions
  ): MultiEntityTableHandle<E>;

  buildBatchWrite<R extends TableSchemaRegistry>(input: BatchWriteMultiInput<R>): BatchWriteMultiCommand<R>;

  buildBatchGet<R extends TableSchemaRegistry>(keys: ReadonlyArray<BatchGetLine<R>>): BatchGetMultiCommand<R>;

  buildTransactWrite<R extends TableSchemaRegistry>(input: TransactWriteMultiInput<R>): TransactWriteMultiCommand<R>;

  buildTransactGet<R extends TableSchemaRegistry>(keys: ReadonlyArray<TransactGetMultiLine<R>>): TransactGetMultiCommand<R>;
}
