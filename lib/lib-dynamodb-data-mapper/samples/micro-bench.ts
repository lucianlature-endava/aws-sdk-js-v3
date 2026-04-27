/**
 * Micro-benchmark: DataMapper vs equivalent raw DynamoDBDocumentClient commands.
 *
 * Default (CPU-focused): `send` is a no-op; measures schema/key mapping + command build + SDK path.
 * With DynamoDB Local: `yarn sample:bench -- --with-local` (requires DynamoDB Local on :8000).
 */

import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { Bench } from "tinybench";
import { createLocalClients } from "../src/client";
import { physicalKeyFromRow } from "../src/schema";
import { ensureUserTable, USER_TABLE_NAME, userTableHandle, UserSchema } from "./user-table";

const TABLE = USER_TABLE_NAME;

const row = {
  userId: "user#123",
  profileKey: "profile",
  name: "Alice",
  email: "alice@example.com",
  body: "",
  version: 1,
} as const;

const key = { userId: row.userId, profileKey: row.profileKey } as const;

/** Row + physical attrs; explicit so `item.pk` / `item.sk` type-check (spread from Record<string,string> does not). */
type BenchUserItem = typeof row & { pk: string; sk: string };
const physicalKey = physicalKeyFromRow(UserSchema, row as unknown as Record<string, unknown>);
const item = { ...row, ...physicalKey } as BenchUserItem;
const { pk, sk } = item;

const withLocal = process.argv.includes("--with-local");

function noopDocumentClient(): DynamoDBDocumentClient {
  return { send: async () => ({}) } as unknown as DynamoDBDocumentClient;
}

async function main() {
  let docClient: DynamoDBDocumentClient;

  if (withLocal) {
    const { ddbClient, docClient: realDoc } = createLocalClients();
    await ensureUserTable(ddbClient);
    docClient = realDoc;
    await docClient.send(
      new PutCommand({
        TableName: TABLE,
        Item: { ...item },
      })
    );
  } else {
    docClient = noopDocumentClient();
  }

  const UserTable = userTableHandle(docClient);
  const bench = new Bench(
    withLocal
      ? { name: "with-local", time: 2500, warmupTime: 400, throws: true }
      : { name: "noop-send (CPU)", time: 900, warmupTime: 200, throws: true }
  );

  bench
    .add("mapper: put", () => UserTable.put({ ...row }))
    .add("raw: PutCommand", () =>
      docClient.send(
        new PutCommand({
          TableName: TABLE,
          Item: { ...item },
        })
      )
    )
    .add("mapper: get", () => UserTable.get({ ...key }))
    .add("raw: GetCommand", () =>
      docClient.send(
        new GetCommand({
          TableName: TABLE,
          Key: {
            pk: item.pk,
            sk: item.sk,
          },
        })
      )
    )
    .add("mapper: update", () => UserTable.update({ ...key }, { set: { name: "Bob", version: 2 } }))
    .add("raw: UpdateCommand", () =>
      docClient.send(
        new UpdateCommand({
          TableName: TABLE,
          Key: { pk, sk },
          UpdateExpression: "SET #n0 = :v0, #n1 = :v1",
          ExpressionAttributeNames: { "#n0": "name", "#n1": "version" },
          ExpressionAttributeValues: { ":v0": "Bob", ":v1": 2 },
        })
      )
    )
    .add("mapper: query", () => UserTable.query({ userId: row.userId }))
    .add("raw: QueryCommand", () =>
      docClient.send(
        new QueryCommand({
          TableName: TABLE,
          KeyConditionExpression: "#pk = :pk",
          ExpressionAttributeNames: { "#pk": "pk" },
          ExpressionAttributeValues: { ":pk": pk },
        })
      )
    )
    .add("mapper: delete", () => UserTable.delete({ ...key }))
    .add("raw: DeleteCommand", () =>
      docClient.send(
        new DeleteCommand({
          TableName: TABLE,
          Key: { pk, sk },
        })
      )
    );

  await bench.run();

  console.log(`Mode: ${withLocal ? "DynamoDB Local (includes RTT)" : "no-op send (CPU / SDK overhead)"}\n`);
  console.table(bench.table());

  if (withLocal) {
    await docClient.send(
      new DeleteCommand({
        TableName: TABLE,
        Key: { pk, sk },
      })
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
