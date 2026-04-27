import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

import type { KeyInput, RowShape } from "../schema";
import type { TableSchemaRegistry } from "./batchMulti";
import type { ConditionOptions } from "./options";
import type { TransactGetLineOutcome, TransactWriteLineOutcome } from "./outcomes";

/** One **Put** statement inside a multi-table transact write (table alias from registry `R`). */
export type TransactPutLine<R extends TableSchemaRegistry> = {
  [K in keyof R]: { table: K & string; kind: "Put"; item: RowShape<R[K]["attributes"]> };
}[keyof R];

/** One **Delete** statement in a transact write. */
export type TransactDeleteLine<R extends TableSchemaRegistry> = {
  [K in keyof R]: {
    table: K & string;
    kind: "Delete";
    key: KeyInput<R[K]["attributes"], R[K]["indexes"]["primary"]>;
  };
}[keyof R];

/** One **Update** (`SET` only at application level) in a transact write. */
export type TransactUpdateLine<R extends TableSchemaRegistry> = {
  [K in keyof R]: {
    table: K & string;
    kind: "Update";
    key: KeyInput<R[K]["attributes"], R[K]["indexes"]["primary"]>;
    set: Partial<RowShape<R[K]["attributes"]>>;
  };
}[keyof R];

/** One **ConditionCheck** in a transact write (no mutation; fails the transaction if condition is false). */
export type TransactConditionCheckLine<R extends TableSchemaRegistry> = {
  [K in keyof R]: {
    table: K & string;
    kind: "ConditionCheck";
    key: KeyInput<R[K]["attributes"], R[K]["indexes"]["primary"]>;
    condition: ConditionOptions;
  };
}[keyof R];

export type TransactWriteMultiLine<R extends TableSchemaRegistry> =
  | TransactPutLine<R>
  | TransactDeleteLine<R>
  | TransactUpdateLine<R>
  | TransactConditionCheckLine<R>;

/** Full transact write payload (max 100 items / 4 MB per DynamoDB transact request; mapper may validate earlier). */
export interface TransactWriteMultiInput<R extends TableSchemaRegistry> {
  items: ReadonlyArray<TransactWriteMultiLine<R>>;
}

/** One **Get** item in **TransactGetItems** (table alias + primary key). */
export type TransactGetMultiLine<R extends TableSchemaRegistry> = {
  [K in keyof R]: {
    table: K & string;
    key: KeyInput<R[K]["attributes"], R[K]["indexes"]["primary"]>;
  };
}[keyof R];

/** Per-table tagged outcome for a transact get line (discriminates which registry entry produced the result). */
export type TransactGetTaggedOutcome<R extends TableSchemaRegistry> = {
  [K in keyof R]: { table: K; outcome: TransactGetLineOutcome<R[K]> };
}[keyof R];

/**
 * Built **TransactWriteItems** command across tables in `R`.
 * `clientRequestToken` should be stable across retries for the same logical transaction (SDK idempotency).
 */
export interface TransactWriteMultiCommand<R extends TableSchemaRegistry> {
  readonly input: TransactWriteMultiInput<R>;
  clientRequestToken(token: string): TransactWriteMultiCommand<R>;
  execute(documentClient: DynamoDBDocumentClient, signal?: AbortSignal): Promise<ReadonlyArray<TransactWriteLineOutcome>>;
}

/** Built **TransactGetItems** command; outcome order aligns with `keys`. */
export interface TransactGetMultiCommand<R extends TableSchemaRegistry> {
  readonly keys: ReadonlyArray<TransactGetMultiLine<R>>;
  execute(documentClient: DynamoDBDocumentClient, signal?: AbortSignal): Promise<ReadonlyArray<TransactGetTaggedOutcome<R>>>;
}
