import type { KeyInput, RowShape, SchemaDef } from "../schema";
import type { DataMapperCommandError, DataMapperValidationError } from "./errors";
import type { QueryableIndexName } from "./indexKeys";
import type { ReadCommandMetadata, WriteCommandMetadata } from "./metadata";
import type { ExclusiveStartKey } from "./pagination";

/**
 * Result of a typed **GetItem** (or equivalent).
 * - `invalid_request`: mapper rejected input (no successful service call, or call aborted before result).
 * - `failed`: DynamoDB / SDK error after a command was attempted; inspect `cause` (`DataMapperCommandError`).
 */
export type GetOutcome<S extends SchemaDef> =
  | { status: "found"; item: Readonly<RowShape<S["attributes"]>>; metadata?: ReadCommandMetadata }
  | { status: "not_found"; key: KeyInput<S["attributes"], S["indexes"]["primary"]>; metadata?: ReadCommandMetadata }
  | { status: "invalid_request"; error: DataMapperValidationError }
  | { status: "failed"; cause: DataMapperCommandError; metadata?: ReadCommandMetadata };

/**
 * Result of **PutItem** with optional condition and return values.
 * `conditional_failed`: condition evaluated false (item unchanged); `key` may be present for correlation.
 */
export type PutOutcome<S extends SchemaDef> =
  | { status: "committed"; item?: Readonly<RowShape<S["attributes"]>>; metadata?: WriteCommandMetadata }
  | { status: "conditional_failed"; key?: KeyInput<S["attributes"], S["indexes"]["primary"]>; metadata?: WriteCommandMetadata }
  | { status: "invalid_request"; error: DataMapperValidationError }
  | { status: "failed"; cause: DataMapperCommandError; metadata?: WriteCommandMetadata };

/** Result of **DeleteItem**; `conditional_failed` includes the logical key that was targeted. */
export type DeleteOutcome<S extends SchemaDef> =
  | { status: "deleted"; metadata?: WriteCommandMetadata }
  | { status: "conditional_failed"; key: KeyInput<S["attributes"], S["indexes"]["primary"]>; metadata?: WriteCommandMetadata }
  | { status: "invalid_request"; error: DataMapperValidationError }
  | { status: "failed"; cause: DataMapperCommandError; metadata?: WriteCommandMetadata };

/** Result of **UpdateItem** (`SET` path in the fluent API); `item` on success depends on `ReturnValues`. */
export type UpdateOutcome<S extends SchemaDef> =
  | { status: "updated"; item?: Readonly<RowShape<S["attributes"]>>; metadata?: WriteCommandMetadata }
  | { status: "conditional_failed"; key: KeyInput<S["attributes"], S["indexes"]["primary"]>; metadata?: WriteCommandMetadata }
  | { status: "invalid_request"; error: DataMapperValidationError }
  | { status: "failed"; cause: DataMapperCommandError; metadata?: WriteCommandMetadata };

/**
 * One **Query** (or scan-shaped) page: either a page of items, validation failure, or wire failure.
 * Use `lastEvaluatedKey` with the next request’s `exclusiveStartKey` to continue (opaque DynamoDB shape).
 */
export type QueryPageOutcome<S extends SchemaDef, I extends QueryableIndexName<S> = "primary"> =
  | {
      status: "page";
      items: ReadonlyArray<Readonly<RowShape<S["attributes"]>>>;
      lastEvaluatedKey?: ExclusiveStartKey;
      queriedIndex: I;
      metadata?: ReadCommandMetadata;
    }
  | { status: "invalid_request"; error: DataMapperValidationError }
  | { status: "failed"; cause: DataMapperCommandError; metadata?: ReadCommandMetadata };

/** Per-key result in **BatchGetItem** (multi-table or single-table batch): one row per requested key. */
export type BatchGetKeyOutcome<S extends SchemaDef> =
  | { status: "fulfilled"; item: Readonly<RowShape<S["attributes"]>>; metadata?: ReadCommandMetadata }
  | { status: "miss"; key: KeyInput<S["attributes"], S["indexes"]["primary"]>; metadata?: ReadCommandMetadata }
  | { status: "invalid_request"; key: KeyInput<S["attributes"], S["indexes"]["primary"]>; error: DataMapperValidationError }
  | { status: "failed"; key: KeyInput<S["attributes"], S["indexes"]["primary"]>; cause: DataMapperCommandError; metadata?: ReadCommandMetadata };

/**
 * Per line in **BatchWriteItem**: written, still **unprocessed** (retry with backoff), invalid input, or failed key/op.
 * `unprocessed` carries no AWS metadata until a successful retry returns a terminal branch.
 */
export type BatchWriteLineOutcome<S extends SchemaDef> =
  | { status: "written"; op: "put"; item: Readonly<RowShape<S["attributes"]>>; metadata?: WriteCommandMetadata }
  | { status: "written"; op: "delete"; key: KeyInput<S["attributes"], S["indexes"]["primary"]>; metadata?: WriteCommandMetadata }
  | { status: "unprocessed"; op: "put"; item: Readonly<RowShape<S["attributes"]>> }
  | { status: "unprocessed"; op: "delete"; key: KeyInput<S["attributes"], S["indexes"]["primary"]> }
  | {
      status: "invalid_request";
      op: "put" | "delete";
      item?: Readonly<RowShape<S["attributes"]>>;
      key?: KeyInput<S["attributes"], S["indexes"]["primary"]>;
      error: DataMapperValidationError;
    }
  | {
      status: "failed";
      op: "put" | "delete";
      item?: Readonly<RowShape<S["attributes"]>>;
      key?: KeyInput<S["attributes"], S["indexes"]["primary"]>;
      cause: DataMapperCommandError;
      metadata?: WriteCommandMetadata;
    };

/**
 * High-level reason when **TransactWriteItems** / **TransactGetItems** completes with cancellation reasons
 * (mirrors common DynamoDB cancellation codes; `Unknown` covers forward compatibility).
 */
export type TransactCancellationCode =
  | "ConditionalCheckFailed"
  | "TransactionConflict"
  | "ProvisionedThroughputExceeded"
  | "ItemCollectionSizeLimitExceeded"
  | "Validation"
  | "IdempotentParameterMismatch"
  | "Unknown";

/**
 * Outcome for one **TransactWrite** statement (by `index` in the original request order).
 * `canceled`: transaction rolled back; inspect `code` and optional `cancellationReasons` from the service.
 */
export type TransactWriteLineOutcome =
  | { status: "committed"; index: number; metadata?: WriteCommandMetadata }
  | {
      status: "canceled";
      index: number;
      code: TransactCancellationCode;
      message?: string;
      cancellationReasons?: ReadonlyArray<{ code?: string; message?: string }>;
    }
  | { status: "invalid_request"; index: number; error: DataMapperValidationError }
  | { status: "failed"; index: number; cause: DataMapperCommandError; metadata?: WriteCommandMetadata };

/** Outcome for one **TransactGet** item: fulfilled, miss, canceled transaction, invalid request, or failed. */
export type TransactGetLineOutcome<S extends SchemaDef> =
  | { status: "fulfilled"; index: number; item: Readonly<RowShape<S["attributes"]>>; metadata?: ReadCommandMetadata }
  | { status: "miss"; index: number; key: KeyInput<S["attributes"], S["indexes"]["primary"]>; metadata?: ReadCommandMetadata }
  | {
      status: "canceled";
      index: number;
      code: TransactCancellationCode;
      message?: string;
      cancellationReasons?: ReadonlyArray<{ code?: string; message?: string }>;
    }
  | { status: "invalid_request"; index: number; error: DataMapperValidationError }
  | { status: "failed"; index: number; cause: DataMapperCommandError; metadata?: ReadCommandMetadata };
