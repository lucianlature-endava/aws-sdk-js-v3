import { CreateTableCommand, DescribeTableCommand } from "@aws-sdk/client-dynamodb";
import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { defineSchema } from "../src/schema";
import { DataMapper } from "../src/table";
import { userTableSchemaDefinition } from "./user-table-schema";

export const USER_TABLE_NAME = "UserTable";

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

export function userTableHandle(client: DynamoDBDocumentClient) {
  return DataMapper.forTable(USER_TABLE_NAME, UserSchema, { client });
}
