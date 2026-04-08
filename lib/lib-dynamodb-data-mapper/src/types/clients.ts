import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

/** Pair returned by `createLocalClients` in `client.ts` (table admin vs document I/O). */
export interface LocalClients {
  /** Service-level client: CreateTable, DescribeTable, etc. */
  ddbClient: DynamoDBClient;
  /** Marshalled plain objects; used by the mapper. */
  docClient: DynamoDBDocumentClient;
}
