import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { CreateTableCommand, DescribeTableCommand } from "@aws-sdk/client-dynamodb";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

import { defineSchema } from "../src/schema";
import { DataMapper } from "../src/table";
import { userTableSchemaDefinition } from "./user-table-schema";

/** Override with **`BENCH_DYNAMODB_TABLE`** when targeting a dedicated benchmark table in AWS. */
export const USER_TABLE_NAME =
  process.env.BENCH_DYNAMODB_TABLE?.trim() || process.env.DYNAMODB_BENCH_TABLE?.trim() || "UserTable";

export const UserSchema = defineSchema(userTableSchemaDefinition);

export type { UserTableRow } from "./user-table-schema";

export async function ensureUserTable(ddbClient: DynamoDBClient): Promise<void> {
  try {
    await ddbClient.send(new DescribeTableCommand({ TableName: USER_TABLE_NAME }));
    return;
  } catch (e) {
    const name = (e as { name?: string }).name;
    if (name !== "ResourceNotFoundException") throw e;
  }

  await ddbClient.send(
    new CreateTableCommand({
      TableName: USER_TABLE_NAME,
      BillingMode: "PAY_PER_REQUEST",
      AttributeDefinitions: [
        { AttributeName: "pk", AttributeType: "S" },
        { AttributeName: "sk", AttributeType: "S" },
      ],
      KeySchema: [
        { AttributeName: "pk", KeyType: "HASH" },
        { AttributeName: "sk", KeyType: "RANGE" },
      ],
    })
  );
  console.log("Created table:", USER_TABLE_NAME);
}

export type BenchNetworkKind = "local" | "aws";

/**
 * Prepares the benchmark table: **`BENCH_ENSURE_TABLE`**
 *
 * - **`1`** / **`true`** — create table if missing (same as **`ensureUserTable`**).
 * - **`0`** / **`false`** — never create; **`DescribeTable`** must succeed (typical for production AWS runs).
 * - **unset** — **`local`** network defaults to **create-if-missing**; **`aws`** defaults to **verify-only** (no create).
 */
export async function ensureBenchTable(ddbClient: DynamoDBClient, network: BenchNetworkKind): Promise<void> {
  const raw = process.env.BENCH_ENSURE_TABLE?.trim().toLowerCase();
  let allowCreate: boolean;
  if (raw === "1" || raw === "true") allowCreate = true;
  else if (raw === "0" || raw === "false") allowCreate = false;
  else allowCreate = network === "local";

  if (allowCreate) {
    await ensureUserTable(ddbClient);
    return;
  }

  await ddbClient.send(new DescribeTableCommand({ TableName: USER_TABLE_NAME }));
}

export function userTableHandle(client: DynamoDBDocumentClient) {
  return DataMapper.forTable(USER_TABLE_NAME, UserSchema, { client });
}
