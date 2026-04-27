/**
 * Optional response fields mirrored from DynamoDB read APIs (`Count`, `ScannedCount`, capacity, metrics).
 * Typed loosely so implementations can forward doc-client shapes without pinning every model revision.
 */
export interface ReadCommandMetadata {
  count?: number;
  scannedCount?: number;
  consumedCapacity?: unknown;
  itemCollectionMetrics?: unknown;
}

/**
 * Optional response fields mirrored from DynamoDB write APIs (`ConsumedCapacity`, `ItemCollectionMetrics`).
 * Shapes follow the document client / service model for the command; treat as opaque if you only persist aggregates.
 */
export interface WriteCommandMetadata {
  consumedCapacity?: unknown;
  itemCollectionMetrics?: unknown;
}
