/**
 * Pagination helpers aligned with `LastEvaluatedKey` / unprocessed items.
 * Values are opaque to the type layer; implementations serialize per DynamoDB rules.
 */
export type ExclusiveStartKey = Record<string, unknown>;

/** Optional client-held pagination token (wraps {@link ExclusiveStartKey} for APIs that expose a cursor object). */
export interface PageCursor {
  readonly exclusiveStartKey?: ExclusiveStartKey;
}
