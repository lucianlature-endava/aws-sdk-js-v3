/**
 * Optional DynamoDB document parameters surfaced on fluent builders from day one.
 * Implementations map these to `ConditionExpression`, `ProjectionExpression`, `ReturnValues`, `ConsistentRead`, etc.
 */

/**
 * Partial attribute value map for DynamoDB `ExpressionAttributeValues` (keys **without** the `:` prefix;
 * the mapper adds prefixes when building the wire request).
 */
export type ExpressionValueMap = Record<string, unknown>;

/** DynamoDB condition expression plus optional name/value substitution maps (SDK attribute value shape). */
export interface ConditionOptions {
  /** DynamoDB `ConditionExpression` string. */
  conditionExpression: string;
  /** `#name` placeholders referenced from `conditionExpression`. */
  expressionAttributeNames?: Record<string, string>;
  /** Values for placeholders; keys match placeholders without leading `:`. */
  expressionAttributeValues?: ExpressionValueMap;
}

/** Attributes to return on read; use with `expressionAttributeNames` when names are reserved or nested. */
export interface ProjectionOptions {
  projectionExpression: string;
  expressionAttributeNames?: Record<string, string>;
}

/**
 * Strongly consistent read when `consistentRead: true`.
 * Omitted or `false`: eventually consistent (default for Query/Scan/Get).
 * **GSI queries** ignore strong consistency; only base table and LSI honor it.
 */
export interface ConsistentReadOption {
  consistentRead?: boolean;
}

/** DynamoDB `ReturnValues` for mutating writes (Put/Update/Delete). Default at wire is typically `NONE` unless set. */
export type ReturnValuesOnWrite =
  | "NONE"
  | "ALL_OLD"
  | "UPDATED_OLD"
  | "ALL_NEW"
  | "UPDATED_NEW";

/** DynamoDB `ReturnValues` for GetItem-style reads. */
export type ReturnValuesOnGet = "NONE" | "ALL_ATTRIBUTES" | "ALL_PROJECTED_ATTRIBUTES" | "SPECIFIC_ATTRIBUTES";
