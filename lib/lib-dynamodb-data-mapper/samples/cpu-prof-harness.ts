/**
 * **CPU profiling harness** — repeats **one** DynamoDB document operation in a tight `await` loop for
 * several seconds so V8’s `--cpu-prof` samples land on SDK / mapper JS instead of mostly `(idle)`.
 * Uses the same **fake `requestHandler`** shape as `micro-bench-comparison.ts` (`--measure-only`):
 * full v3 middleware + doc marshal/unmarshal, no sockets.
 *
 * Run from `lib/lib-dynamodb-data-mapper` package root:
 *
 * - `yarn sample:bench:cpu-prof-harness` — default **v3 doc GetItem**, ~8s wall + profile
 * - `yarn sample:bench:cpu-prof-harness -- --seconds=15 --stack=mapper` — **DataMapper** get
 * - `yarn sample:bench:cpu-prof-harness -- --op=put` — raw doc **PutItem** (etc.: `get|put|update|query|delete`)
 *
 * Flags: `--seconds=<n>` (default `8`), `--warmup-ms=<n>` (default `400`), `--stack=doc|mapper`,
 * `--op=<name>`. Env: `CPU_PROF_HARNESS_SECONDS`, `CPU_PROF_HARNESS_WARMUP_MS` override defaults when set.
 *
 * Open the generated file under `./cpu-prof/*.cpuprofile` in Chrome DevTools → Performance → Load profile.
 */

import type { AttributeValue } from "@aws-sdk/client-dynamodb";
import { DynamoDB } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import process from "node:process";
import { Readable } from "node:stream";

import { physicalKeyFromRow } from "../src/schema";
import { USER_TABLE_NAME, UserSchema, userTableHandle } from "./user-table";

const TABLE = USER_TABLE_NAME;
const LOCAL_ENDPOINT = process.env.DYNAMODB_ENDPOINT ?? "http://localhost:8000";

const row = {
  userId: "user#123",
  profileKey: "profile",
  name: "Alice",
  email: "alice@example.com",
  body: "",
  version: 1,
} as const;

const key = { userId: row.userId, profileKey: row.profileKey } as const;
type BenchUserItem = typeof row & { pk: string; sk: string };
const physicalKey = physicalKeyFromRow(UserSchema, row as unknown as Record<string, unknown>);
const item = { ...row, ...physicalKey } as BenchUserItem;
const { pk, sk } = item;

function benchUserItemToAttributeMap(i: BenchUserItem): Record<string, AttributeValue> {
  return {
    pk: { S: i.pk },
    sk: { S: i.sk },
    userId: { S: i.userId },
    profileKey: { S: i.profileKey },
    name: { S: i.name },
    email: { S: i.email },
    body: { S: i.body },
    version: { N: String(i.version) },
  };
}

type FakeHttpRequest = { headers: Record<string, string | undefined> };
type FakeHttpResponse = {
  statusCode: number;
  reason: string;
  headers: Record<string, string>;
  body: Readable;
};

function buildMeasureOnlyDynamoDb(avItem: Record<string, AttributeValue>): DynamoDB {
  const jsonBodyForOperation = (operation: string | undefined): Record<string, unknown> => {
    switch (operation) {
      case "GetItem":
        return { Item: avItem };
      case "UpdateItem":
        return { Attributes: avItem };
      case "Query":
        return { Items: [avItem], Count: 1, ScannedCount: 1 };
      case "Scan":
        return { Items: [avItem], Count: 1, ScannedCount: 1 };
      case "PutItem":
      case "DeleteItem":
      default:
        return {};
    }
  };

  const buildHttpResponse = (request: FakeHttpRequest): { response: FakeHttpResponse } => {
    const targetRaw =
      request.headers["X-Amz-Target"] ?? request.headers["x-amz-target"] ?? "";
    const operation = targetRaw.split(".").pop();
    const bodyBuf = Buffer.from(JSON.stringify(jsonBodyForOperation(operation)));
    return {
      response: {
        statusCode: 200,
        reason: "OK",
        headers: {
          "content-type": "application/x-amz-json-1.0",
          "content-length": String(bodyBuf.byteLength),
        },
        body: Readable.from([bodyBuf]),
      },
    };
  };

  const fakeRequestHandler = {
    handle: async (request: FakeHttpRequest): Promise<{ response: FakeHttpResponse }> =>
      buildHttpResponse(request),
    destroy: () => undefined,
    updateHttpClientConfig: () => undefined,
    httpHandlerConfigs: () => ({}),
  };

  return new DynamoDB({
    endpoint: LOCAL_ENDPOINT,
    region: process.env.AWS_REGION ?? "us-east-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "local",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "local",
    },
    requestHandler: fakeRequestHandler as unknown as NonNullable<
      ConstructorParameters<typeof DynamoDB>[0]
    >["requestHandler"],
  });
}

function parseArg(name: string): string | undefined {
  const hit = process.argv.find((a) => a === name || a.startsWith(`${name}=`));
  if (!hit) return undefined;
  if (hit === name) return "";
  return hit.slice(name.length + 1);
}

function parseSeconds(): number {
  const fromEnv = process.env.CPU_PROF_HARNESS_SECONDS;
  if (fromEnv && /^\d+(\.\d+)?$/.test(fromEnv)) return Number(fromEnv);
  const a = parseArg("--seconds");
  if (a !== undefined && a !== "" && /^\d+(\.\d+)?$/.test(a)) return Number(a);
  return 8;
}

function parseWarmupMs(): number {
  const fromEnv = process.env.CPU_PROF_HARNESS_WARMUP_MS;
  if (fromEnv && /^\d+$/.test(fromEnv)) return Number(fromEnv);
  const a = parseArg("--warmup-ms");
  if (a !== undefined && a !== "" && /^\d+$/.test(a)) return Number(a);
  return 400;
}

type OpName = "get" | "put" | "update" | "query" | "delete";
type StackName = "doc" | "mapper";

function parseOp(): OpName {
  const raw = (parseArg("--op") ?? "get").toLowerCase();
  if (raw === "get" || raw === "put" || raw === "update" || raw === "query" || raw === "delete") {
    return raw;
  }
  console.error(`Unknown --op=${raw}; use get|put|update|query|delete`);
  process.exit(1);
}

function parseStack(): StackName {
  const raw = (parseArg("--stack") ?? "doc").toLowerCase();
  if (raw === "doc" || raw === "mapper") return raw;
  console.error(`Unknown --stack=${raw}; use doc|mapper`);
  process.exit(1);
}

async function main(): Promise<void> {
  const seconds = parseSeconds();
  const warmupMs = parseWarmupMs();
  const op = parseOp();
  const stack = parseStack();

  const avItem = benchUserItemToAttributeMap(item);
  const ddb = buildMeasureOnlyDynamoDb(avItem);
  const docClient = DynamoDBDocumentClient.from(ddb);
  const UserTable = userTableHandle(docClient);

  const runDoc = (): Promise<unknown> => {
    switch (op) {
      case "get":
        return docClient.send(
          new GetCommand({
            TableName: TABLE,
            Key: { pk, sk },
          })
        );
      case "put":
        return docClient.send(
          new PutCommand({
            TableName: TABLE,
            Item: { ...item },
          })
        );
      case "update":
        return docClient.send(
          new UpdateCommand({
            TableName: TABLE,
            Key: { pk, sk },
            UpdateExpression: "SET #n0 = :v0, #n1 = :v1",
            ExpressionAttributeNames: { "#n0": "name", "#n1": "version" },
            ExpressionAttributeValues: { ":v0": "Bob", ":v1": 2 },
          })
        );
      case "query":
        return docClient.send(
          new QueryCommand({
            TableName: TABLE,
            KeyConditionExpression: "#pk = :pk",
            ExpressionAttributeNames: { "#pk": "pk" },
            ExpressionAttributeValues: { ":pk": pk },
          })
        );
      case "delete":
        return docClient.send(
          new DeleteCommand({
            TableName: TABLE,
            Key: { pk, sk },
          })
        );
    }
  };

  const runMapper = (): Promise<unknown> => {
    switch (op) {
      case "get":
        return UserTable.get({ ...key });
      case "put":
        return UserTable.put({ ...row });
      case "update":
        return UserTable.update({ ...key }, { set: { name: "Bob", version: 2 } });
      case "query":
        return UserTable.query({ userId: row.userId });
      case "delete":
        return UserTable.delete({ ...key });
    }
  };

  const run = stack === "doc" ? runDoc : runMapper;

  const label = `${stack} ${op}`;
  let iters = 0;
  const tWarm = performance.now();
  while (performance.now() - tWarm < warmupMs) {
    await run();
    iters++;
  }

  const t0 = performance.now();
  const budgetMs = seconds * 1000;
  while (performance.now() - t0 < budgetMs) {
    await run();
    iters++;
  }
  const wallMs = performance.now() - t0;

  console.error(
    `[cpu-prof-harness] ${label} | warmup ${warmupMs}ms | measure ${seconds}s wall=${wallMs.toFixed(
      0
    )}ms | total iterations=${iters}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
