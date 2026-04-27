import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

import type { KeyInput, RowShape, SchemaDef } from "../schema";
import type { BatchGetKeyOutcome, BatchWriteLineOutcome } from "./outcomes";

/**
 * Multi-table registry: each key is a stable alias (e.g. `"usersTable"`) bound to a {@link SchemaDef}.
 * Matches the DynamoDB `BatchGetItem` / `BatchWriteItem` map-of-table-requests shape.
 */
export type TableSchemaRegistry = Record<string, SchemaDef>;

export type BatchPutLine<R extends TableSchemaRegistry> = {
  [K in keyof R]: { table: K & string; item: RowShape<R[K]["attributes"]> };
}[keyof R];

export type BatchDeleteLine<R extends TableSchemaRegistry> = {
  [K in keyof R]: {
    table: K & string;
    key: KeyInput<R[K]["attributes"], R[K]["indexes"]["primary"]>;
  };
}[keyof R];

export type BatchGetLine<R extends TableSchemaRegistry> = {
  [K in keyof R]: {
    table: K & string;
    key: KeyInput<R[K]["attributes"], R[K]["indexes"]["primary"]>;
  };
}[keyof R];

/** Logical batch write across tables in `R`; implementation may split across multiple `BatchWriteItem` calls. */
export interface BatchWriteMultiInput<R extends TableSchemaRegistry> {
  put?: ReadonlyArray<BatchPutLine<R>>;
  delete?: ReadonlyArray<BatchDeleteLine<R>>;
}

export type BatchWriteMultiTaggedLine<R extends TableSchemaRegistry> = {
  [K in keyof R]: { table: K; outcome: BatchWriteLineOutcome<R[K]> };
}[keyof R];

export type BatchGetMultiTaggedLine<R extends TableSchemaRegistry> = {
  [K in keyof R]: {
    table: K;
    key: KeyInput<R[K]["attributes"], R[K]["indexes"]["primary"]>;
    outcome: BatchGetKeyOutcome<R[K]>;
  };
}[keyof R];

/**
 * Built multi-table **BatchWriteItem** command: `execute` sends one or more service requests (25-item limit per call).
 * {@link BatchWriteMultiCommand.iterateUnprocessed} helps re-submit lines still in `unprocessed` state.
 */
export interface BatchWriteMultiCommand<R extends TableSchemaRegistry> {
  readonly input: BatchWriteMultiInput<R>;
  execute(documentClient: DynamoDBDocumentClient, signal?: AbortSignal): Promise<ReadonlyArray<BatchWriteMultiTaggedLine<R>>>;
  iterateUnprocessed(
    prior: ReadonlyArray<BatchWriteMultiTaggedLine<R>>,
    signal?: AbortSignal
  ): AsyncIterableIterator<ReadonlyArray<BatchWriteMultiTaggedLine<R>>>;
}

/**
 * Built multi-table **BatchGetItem** command: `keys` may be chunked (100 keys / 16 MB per request).
 * {@link BatchGetMultiCommand.iterateUnprocessed} retries unprocessed keys from a prior result set.
 */
export interface BatchGetMultiCommand<R extends TableSchemaRegistry> {
  readonly keys: ReadonlyArray<BatchGetLine<R>>;
  execute(documentClient: DynamoDBDocumentClient, signal?: AbortSignal): Promise<ReadonlyArray<BatchGetMultiTaggedLine<R>>>;
  iterateUnprocessed(
    prior: ReadonlyArray<BatchGetMultiTaggedLine<R>>,
    signal?: AbortSignal
  ): AsyncIterableIterator<ReadonlyArray<BatchGetMultiTaggedLine<R>>>;
}
