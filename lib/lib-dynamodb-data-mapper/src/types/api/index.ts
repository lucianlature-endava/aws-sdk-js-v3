/**
 * Promoted **API types** for the DynamoDB data mapper (fluent builders, outcomes, errors, multi-table batch/transact,
 * multi-entity tables). Comments here surface in IntelliSense when importing from `src/types`; root `index.ts` may
 * re-export a subset for the published package surface.
 */
export type { DataMapperFactory, EntityMap, ForEntitiesOptions, MultiEntityTableHandle } from "./dataMapperFactory";
export type {
  BatchDeleteLine,
  BatchGetLine,
  BatchGetMultiCommand,
  BatchGetMultiTaggedLine,
  BatchPutLine,
  BatchWriteMultiCommand,
  BatchWriteMultiInput,
  BatchWriteMultiTaggedLine,
  TableSchemaRegistry,
} from "./batchMulti";
export type {
  PutCommandFluent,
  GetCommandFluent,
  DeleteCommandFluent,
  UpdateCommandFluent,
  QueryCommandFluent,
  ScanCommandFluent,
  BatchGetCommandFluent,
  BatchWriteCommandFluent,
  TransactWriteCommandFluent,
  TransactGetCommandFluent,
} from "./fluentBuilders";
export type {
  IndexPkComposite,
  QueryPartitionInput,
  QueryableIndexName,
  EffectiveIndexKeys,
} from "./indexKeys";
export type {
  ConditionOptions,
  ConsistentReadOption,
  ExpressionValueMap,
  ProjectionOptions,
  ReturnValuesOnGet,
  ReturnValuesOnWrite,
} from "./options";
export type { ExclusiveStartKey, PageCursor } from "./pagination";
export type {
  DataMapperCommandError,
  DataMapperValidationCode,
  DataMapperValidationError,
  DataMapperWireError,
} from "./errors";
export type { ReadCommandMetadata, WriteCommandMetadata } from "./metadata";
export {
  batchGetKeyIsFulfilled,
  batchWriteLineIsUnprocessed,
  deleteOutcomeIsDeleted,
  deleteOutcomeIsInvalidRequest,
  getOutcomeIsFound,
  getOutcomeIsInvalidRequest,
  getOutcomeIsNotFound,
  isDataMapperValidationError,
  isDataMapperWireError,
  putOutcomeIsCommitted,
  putOutcomeIsInvalidRequest,
  queryPageIsPage,
  transactGetLineIsFulfilled,
  transactGetLineIsInvalidRequest,
  transactWriteLineIsCanceled,
  transactWriteLineIsCommitted,
  transactWriteLineIsInvalidRequest,
  updateOutcomeIsInvalidRequest,
  updateOutcomeIsUpdated,
} from "./guards";
export type {
  BatchGetKeyOutcome,
  BatchWriteLineOutcome,
  DeleteOutcome,
  GetOutcome,
  PutOutcome,
  QueryPageOutcome,
  TransactCancellationCode,
  TransactGetLineOutcome,
  TransactWriteLineOutcome,
  UpdateOutcome,
} from "./outcomes";
export type {
  TransactConditionCheckLine,
  TransactDeleteLine,
  TransactGetMultiCommand,
  TransactGetMultiLine,
  TransactGetTaggedOutcome,
  TransactPutLine,
  TransactUpdateLine,
  TransactWriteMultiCommand,
  TransactWriteMultiInput,
  TransactWriteMultiLine,
} from "./transactMulti";
export type {
  BatchWriteSingleTableInput,
  TableHandleApi,
  TransactWriteSingleItem,
} from "./tableHandleApi";
