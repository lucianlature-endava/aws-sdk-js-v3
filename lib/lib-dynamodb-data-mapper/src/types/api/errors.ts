import type { ServiceException } from "@smithy/smithy-client";

/**
 * Mapper-side validation failures (bad key shape, illegal attribute update, empty mutation, etc.).
 * Distinct from DynamoDB `ServiceException` so callers can branch without string-matching AWS messages.
 */
export type DataMapperValidationCode =
  | "KEY_ATTRIBUTE_MUTATION"
  | "EMPTY_MUTATION"
  | "INVALID_KEY_INPUT"
  | "INVALID_QUERY_INPUT"
  | "INVALID_BATCH_INPUT"
  | "INVALID_TRANSACT_INPUT"
  | (string & {});

/**
 * Validation failed **before** (or without) a successful DynamoDB round-trip.
 * Use {@link DataMapperValidationCode} to branch; `details` is implementation-defined (field paths, constraints).
 */
export interface DataMapperValidationError {
  readonly name: "DataMapperValidationError";
  readonly $fault: "client";
  /** Stable machine-readable reason; extend with string literals as the mapper adds checks. */
  code: DataMapperValidationCode;
  /** Human-readable explanation (not for equality checks across versions). */
  message: string;
  /** Optional structured context (e.g. attribute names); do not log secrets from application payloads. */
  details?: Readonly<Record<string, unknown>>;
}

/** Errors raised by the DynamoDB client / service after a command is sent. */
export type DataMapperWireError = ServiceException;

/** Any error surfaced on `failed` outcome branches (wire + local validation when re-thrown as failed). */
export type DataMapperCommandError = DataMapperWireError | DataMapperValidationError;
