import type { ServiceException } from "@smithy/smithy-client";

import type { SchemaDef } from "../schema";
import type { DataMapperValidationError } from "./errors";
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

/**
 * Type guards for validation errors, AWS-shaped `ServiceException` wire errors, and outcome discriminated unions.
 * Prefer guards over ad-hoc `status ===` checks so the outcome model can evolve safely.
 */

/** True when `e` is a {@link DataMapperValidationError} (discriminated by `name`). */
export function isDataMapperValidationError(e: unknown): e is DataMapperValidationError {
  return typeof e === "object" && e !== null && (e as DataMapperValidationError).name === "DataMapperValidationError";
}

/** True for AWS-shaped errors; excludes {@link DataMapperValidationError}. */
export function isDataMapperWireError(e: unknown): e is ServiceException {
  if (typeof e !== "object" || e === null || !("$metadata" in e)) return false;
  return (e as { name?: string }).name !== "DataMapperValidationError";
}

export function getOutcomeIsFound<S extends SchemaDef>(o: GetOutcome<S>): o is Extract<GetOutcome<S>, { status: "found" }> {
  return o.status === "found";
}

export function getOutcomeIsNotFound<S extends SchemaDef>(o: GetOutcome<S>): o is Extract<GetOutcome<S>, { status: "not_found" }> {
  return o.status === "not_found";
}

export function getOutcomeIsInvalidRequest<S extends SchemaDef>(
  o: GetOutcome<S>
): o is Extract<GetOutcome<S>, { status: "invalid_request" }> {
  return o.status === "invalid_request";
}

export function putOutcomeIsCommitted<S extends SchemaDef>(o: PutOutcome<S>): o is Extract<PutOutcome<S>, { status: "committed" }> {
  return o.status === "committed";
}

export function putOutcomeIsInvalidRequest<S extends SchemaDef>(
  o: PutOutcome<S>
): o is Extract<PutOutcome<S>, { status: "invalid_request" }> {
  return o.status === "invalid_request";
}

export function updateOutcomeIsUpdated<S extends SchemaDef>(o: UpdateOutcome<S>): o is Extract<UpdateOutcome<S>, { status: "updated" }> {
  return o.status === "updated";
}

export function updateOutcomeIsInvalidRequest<S extends SchemaDef>(
  o: UpdateOutcome<S>
): o is Extract<UpdateOutcome<S>, { status: "invalid_request" }> {
  return o.status === "invalid_request";
}

export function deleteOutcomeIsDeleted<S extends SchemaDef>(o: DeleteOutcome<S>): o is Extract<DeleteOutcome<S>, { status: "deleted" }> {
  return o.status === "deleted";
}

export function deleteOutcomeIsInvalidRequest<S extends SchemaDef>(
  o: DeleteOutcome<S>
): o is Extract<DeleteOutcome<S>, { status: "invalid_request" }> {
  return o.status === "invalid_request";
}

export function queryPageIsPage<S extends SchemaDef, I extends string>(
  o: QueryPageOutcome<S, I>
): o is Extract<QueryPageOutcome<S, I>, { status: "page" }> {
  return o.status === "page";
}

export function batchGetKeyIsFulfilled<S extends SchemaDef>(
  o: BatchGetKeyOutcome<S>
): o is Extract<BatchGetKeyOutcome<S>, { status: "fulfilled" }> {
  return o.status === "fulfilled";
}

export function batchWriteLineIsUnprocessed<S extends SchemaDef>(
  o: BatchWriteLineOutcome<S>
): o is Extract<BatchWriteLineOutcome<S>, { status: "unprocessed" }> {
  return o.status === "unprocessed";
}

export function transactWriteLineIsCommitted(o: TransactWriteLineOutcome): o is Extract<TransactWriteLineOutcome, { status: "committed" }> {
  return o.status === "committed";
}

export function transactWriteLineIsCanceled(
  o: TransactWriteLineOutcome
): o is Extract<TransactWriteLineOutcome, { status: "canceled" }> {
  return o.status === "canceled";
}

export function transactWriteLineIsInvalidRequest(
  o: TransactWriteLineOutcome
): o is Extract<TransactWriteLineOutcome, { status: "invalid_request" }> {
  return o.status === "invalid_request";
}

export function transactGetLineIsInvalidRequest<S extends SchemaDef>(
  o: TransactGetLineOutcome<S>
): o is Extract<TransactGetLineOutcome<S>, { status: "invalid_request" }> {
  return o.status === "invalid_request";
}

export function transactGetLineIsFulfilled<S extends SchemaDef>(
  o: TransactGetLineOutcome<S>
): o is Extract<TransactGetLineOutcome<S>, { status: "fulfilled" }> {
  return o.status === "fulfilled";
}
