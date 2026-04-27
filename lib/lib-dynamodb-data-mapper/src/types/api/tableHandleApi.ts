import type { KeyInput, RowShape, SchemaDef } from "../schema";
import type {
  BatchGetCommandFluent,
  BatchWriteCommandFluent,
  DeleteCommandFluent,
  GetCommandFluent,
  PutCommandFluent,
  QueryCommandFluent,
  ScanCommandFluent,
  TransactGetCommandFluent,
  TransactWriteCommandFluent,
  UpdateCommandFluent,
} from "./fluentBuilders";
import type { QueryableIndexName,QueryPartitionInput } from "./indexKeys";
import type { ConditionOptions } from "./options";

/** Same-table transactional writes (logical item shapes). */
export type TransactWriteSingleItem<S extends SchemaDef> =
  | { kind: "Put"; item: RowShape<S["attributes"]> }
  | { kind: "Delete"; key: KeyInput<S["attributes"], S["indexes"]["primary"]> }
  | {
      kind: "Update";
      key: KeyInput<S["attributes"], S["indexes"]["primary"]>;
      set: Partial<RowShape<S["attributes"]>>;
    }
  | {
      kind: "ConditionCheck";
      key: KeyInput<S["attributes"], S["indexes"]["primary"]>;
      condition: ConditionOptions;
    };

/** Same-table **BatchWriteItem** input: full rows to put and/or primary keys to delete. */
export interface BatchWriteSingleTableInput<S extends SchemaDef> {
  put?: ReadonlyArray<RowShape<S["attributes"]>>;
  delete?: ReadonlyArray<KeyInput<S["attributes"], S["indexes"]["primary"]>>;
}

/**
 * Typed table surface: fluent command builders (terminal `execute()` / `iteratePages()`)
 * plus batch/transact entry points for one `SchemaDef`.
 */
export interface TableHandleApi<S extends SchemaDef> {
  put(item: RowShape<S["attributes"]>): PutCommandFluent<S>;

  get(key: KeyInput<S["attributes"], S["indexes"]["primary"]>): GetCommandFluent<S>;

  update(key: KeyInput<S["attributes"], S["indexes"]["primary"]>): UpdateCommandFluent<S>;

  delete(key: KeyInput<S["attributes"], S["indexes"]["primary"]>): DeleteCommandFluent<S>;

  query<I extends QueryableIndexName<S>>(
    index: I,
    partition: QueryPartitionInput<S, I>
  ): QueryCommandFluent<S, I>;

  /** Base-table scan (type-level only until implemented). */
  scan(): ScanCommandFluent<S>;

  batchGet(keys: ReadonlyArray<KeyInput<S["attributes"], S["indexes"]["primary"]>>): BatchGetCommandFluent<S>;

  batchWrite(input: BatchWriteSingleTableInput<S>): BatchWriteCommandFluent<S>;

  transactGet(keys: ReadonlyArray<KeyInput<S["attributes"], S["indexes"]["primary"]>>): TransactGetCommandFluent<S>;

  transactWrite(items: ReadonlyArray<TransactWriteSingleItem<S>>): TransactWriteCommandFluent;
}
