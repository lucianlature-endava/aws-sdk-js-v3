import type { RowShape, SchemaDef } from "../schema";
import type { QueryableIndexName } from "./indexKeys";
import type { ConditionOptions, ProjectionOptions, ReturnValuesOnGet, ReturnValuesOnWrite } from "./options";
import type {
  BatchGetKeyOutcome,
  BatchWriteLineOutcome,
  DeleteOutcome,
  GetOutcome,
  PutOutcome,
  QueryPageOutcome,
  TransactGetLineOutcome,
  TransactWriteLineOutcome,
  UpdateOutcome,
} from "./outcomes";
import type { ExclusiveStartKey } from "./pagination";

/**
 * Fluent **PutItem** builder: optional condition and return values, then `execute()`.
 * `signal` is honored when the runtime implements cooperative cancellation on the underlying client calls.
 */
export interface PutCommandFluent<S extends SchemaDef> {
  condition(opts: ConditionOptions): PutCommandFluent<S>;
  returnValues(rv: ReturnValuesOnWrite): PutCommandFluent<S>;
  execute(signal?: AbortSignal): Promise<PutOutcome<S>>;
}

/** Fluent **GetItem** builder: optional condition, consistency, projection, return values. */
export interface GetCommandFluent<S extends SchemaDef> {
  condition(opts: ConditionOptions): GetCommandFluent<S>;
  consistentRead(flag: boolean): GetCommandFluent<S>;
  projection(opts: ProjectionOptions): GetCommandFluent<S>;
  returnValues(rv: ReturnValuesOnGet): GetCommandFluent<S>;
  execute(signal?: AbortSignal): Promise<GetOutcome<S>>;
}

/** Fluent **DeleteItem** builder. */
export interface DeleteCommandFluent<S extends SchemaDef> {
  condition(opts: ConditionOptions): DeleteCommandFluent<S>;
  returnValues(rv: ReturnValuesOnWrite): DeleteCommandFluent<S>;
  execute(signal?: AbortSignal): Promise<DeleteOutcome<S>>;
}

/** Fluent **UpdateItem** builder: `set` partial logical attributes; optional condition and return values. */
export interface UpdateCommandFluent<S extends SchemaDef> {
  set(attrs: Partial<RowShape<S["attributes"]>>): UpdateCommandFluent<S>;
  condition(opts: ConditionOptions): UpdateCommandFluent<S>;
  returnValues(rv: ReturnValuesOnWrite): UpdateCommandFluent<S>;
  execute(signal?: AbortSignal): Promise<UpdateOutcome<S>>;
}

/**
 * Fluent **Query** for index `I`: key condition is fixed by `partition`; add filter via `condition` when supported.
 * `limit` is items before filtering (DynamoDB `Limit` semantics).
 */
export interface QueryCommandFluent<S extends SchemaDef, I extends QueryableIndexName<S> = "primary"> {
  condition(opts: ConditionOptions): QueryCommandFluent<S, I>;
  consistentRead(flag: boolean): QueryCommandFluent<S, I>;
  projection(opts: ProjectionOptions): QueryCommandFluent<S, I>;
  limit(count: number): QueryCommandFluent<S, I>;
  exclusiveStartKey(key: ExclusiveStartKey): QueryCommandFluent<S, I>;
  execute(signal?: AbortSignal): Promise<QueryPageOutcome<S, I>>;
  /** Yields successive pages until no `lastEvaluatedKey` remains (stop early by aborting `signal`). */
  iteratePages(signal?: AbortSignal): AsyncIterableIterator<QueryPageOutcome<S, I>>;
}

/** Fluent base-table **Scan** (one page per `execute`; pages via {@link ScanCommandFluent.iteratePages}). */
export interface ScanCommandFluent<S extends SchemaDef> {
  consistentRead(flag: boolean): ScanCommandFluent<S>;
  projection(opts: ProjectionOptions): ScanCommandFluent<S>;
  limit(count: number): ScanCommandFluent<S>;
  exclusiveStartKey(key: ExclusiveStartKey): ScanCommandFluent<S>;
  execute(signal?: AbortSignal): Promise<QueryPageOutcome<S, "primary">>;
  iteratePages(signal?: AbortSignal): AsyncIterableIterator<QueryPageOutcome<S, "primary">>;
}

/**
 * **BatchGetItem** for one table/schema: one outcome per input key (order preserved by contract).
 * {@link BatchGetCommandFluent.iterateUnprocessed} is for retries when the service returns unprocessed keys.
 */
export interface BatchGetCommandFluent<S extends SchemaDef> {
  consistentRead(flag: boolean): BatchGetCommandFluent<S>;
  projection(opts: ProjectionOptions): BatchGetCommandFluent<S>;
  execute(signal?: AbortSignal): Promise<ReadonlyArray<BatchGetKeyOutcome<S>>>;
  /** Re-drive keys that returned `miss` or `failed` (caller-controlled backoff; not a DynamoDB automatic retry). */
  iterateUnprocessed(
    prior: ReadonlyArray<BatchGetKeyOutcome<S>>,
    signal?: AbortSignal
  ): AsyncIterableIterator<ReadonlyArray<BatchGetKeyOutcome<S>>>;
}

/**
 * **BatchWriteItem** for one table: lines may come back `unprocessed`; use {@link BatchWriteCommandFluent.iterateUnprocessed}
 * with exponential backoff and respect throughput limits.
 */
export interface BatchWriteCommandFluent<S extends SchemaDef> {
  execute(signal?: AbortSignal): Promise<ReadonlyArray<BatchWriteLineOutcome<S>>>;
  iterateUnprocessed(
    prior: ReadonlyArray<BatchWriteLineOutcome<S>>,
    signal?: AbortSignal
  ): AsyncIterableIterator<ReadonlyArray<BatchWriteLineOutcome<S>>>;
}

/**
 * **TransactWriteItems** in one transaction. `clientRequestToken` enables idempotent retries for the same logical write.
 */
export interface TransactWriteCommandFluent {
  clientRequestToken(token: string): TransactWriteCommandFluent;
  execute(signal?: AbortSignal): Promise<ReadonlyArray<TransactWriteLineOutcome>>;
}

/** **TransactGetItems** for one table: stable ordering of outcomes matches the input key array. */
export interface TransactGetCommandFluent<S extends SchemaDef> {
  consistentRead(flag: boolean): TransactGetCommandFluent<S>;
  projection(opts: ProjectionOptions): TransactGetCommandFluent<S>;
  execute(signal?: AbortSignal): Promise<ReadonlyArray<TransactGetLineOutcome<S>>>;
}
