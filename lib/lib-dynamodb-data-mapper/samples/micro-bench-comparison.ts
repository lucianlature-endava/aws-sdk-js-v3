/**
 * Cross-stack micro-benchmark for a performance comparison matrix:
 * **AWS SDK v2** `DocumentClient`, **v3** `DynamoDBDocumentClient` (document path),
 * **PoC DataMapper** (`@aws-sdk/lib-dynamodb-data-mapper`), **ElectroDB**, **Dynamoose**.
 *
 * Same item shape as `micro-bench.ts` / proposal Appendix I (same `UserTable` keys). **Measurement**
 * is **sequential** (`await run()` one after another): per-call timings on Node’s **single-threaded**
 * event loop are **not** comparable when many calls run in parallel—concurrent `Promise.all` inflates
 * later completions with queue wait and made stack-vs-stack gaps look absurdly large. **Warmup** then
 * **measure** windows; each invocation’s wall time is recorded in **nanoseconds** via `**hrtime.bigint()**`
 * (not `**performance.now()**`, which can quantize sub-µs work and distort **p90**). **Median of batch-p90**
 * chunks **consecutive** samples into groups of `BATCH_SIZE` and takes **median** of per-chunk **p90**
 * (robust batch-level tail without parallel distortion).
 *
 * Pick **exactly one** mode (mutually exclusive):
 *
 * - **`--measure-only`** — **no** DynamoDB I/O: `DynamoDBDocumentClient.send` is a no-op; Dynamoose
 *   uses an in-process `DynamoDB` stub. **v2 `DocumentClient`** tasks are **omitted** (no faithful
 *   no-network path). Isolates **library + SDK mapping** cost.
 * - **`--with-local`** — real RTT to **[DynamoDB Local](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.html)**
 *   on port 8000 (`docker compose up -d`). Dominated by Local/JVM latency.
 *
 * Run from package root:
 *   `yarn sample:bench:compare -- --measure-only`
 *   `yarn sample:bench:compare -- --with-local`
 *
 * Notes:
 * - **ElectroDB** persists `__edb_e__` / `__edb_v__` on items (library metadata); update path
 *   refreshes those alongside business fields (realistic ElectroDB wire shape).
 * - Numbers are **environment-specific**; not a production SLA.
 */

import type { AttributeValue } from "@aws-sdk/client-dynamodb";
import { DynamoDB } from "@aws-sdk/client-dynamodb";
import {
  type DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import AWS from "aws-sdk";
import dynamoose from "dynamoose";
import { Entity } from "electrodb";
import process from "node:process";

import { createLocalClients } from "../src/client";
import { physicalKeyFromRow } from "../src/schema";
import { ensureUserTable, USER_TABLE_NAME, UserSchema, userTableHandle } from "./user-table";

const TABLE = USER_TABLE_NAME;

/** Same defaults as `createLocalClients()` — duplicated so Dynamoose gets a `DynamoDB` service instance. */
const LOCAL_ENDPOINT = process.env.DYNAMODB_ENDPOINT ?? "http://localhost:8000";

/** Logical row + physical keys (same wire item as `micro-bench.ts`). */
const row = {
  userId: "user#123",
  profileKey: "profile",
  name: "Alice",
  email: "alice@example.com",
  version: 1,
} as const;

const key = { userId: row.userId, profileKey: row.profileKey } as const;

type BenchUserItem = typeof row & { pk: string; sk: string };
const physicalKey = physicalKeyFromRow(UserSchema, row as unknown as Record<string, unknown>);
const item = { ...row, ...physicalKey } as BenchUserItem;
const { pk, sk } = item;

const withLocal = process.argv.includes("--with-local");
const measureOnly = process.argv.includes("--measure-only");

/** Chunk size for “batch p90 → median” (post-hoc on sequential samples; not concurrent execution). */
const BATCH_SIZE = 25;
const WARMUP_MS = 400;
const MEASURE_MS = 2500;

function noopDocumentClient(): DynamoDBDocumentClient {
  return { send: async () => ({}) } as unknown as DynamoDBDocumentClient;
}

function benchUserItemToAttributeMap(i: BenchUserItem): Record<string, AttributeValue> {
  return {
    pk: { S: i.pk },
    sk: { S: i.sk },
    userId: { S: i.userId },
    profileKey: { S: i.profileKey },
    name: { S: i.name },
    email: { S: i.email },
    version: { N: String(i.version) },
  };
}

/** Minimal v3 `DynamoDB` surface for Dynamoose in `--measure-only` (no network). */
function noopDynamoDbServiceForDynamoose(avItem: Record<string, AttributeValue>): DynamoDB {
  return {
    putItem: async () => ({}),
    getItem: async () => ({ Item: avItem }),
    updateItem: async () => ({ Attributes: avItem }),
    deleteItem: async () => ({}),
    query: async () => ({ Items: [avItem], Count: 1 }),
  } as unknown as DynamoDB;
}

/** Linear interpolation on sorted ascending samples; `p` in [0, 1]. */
function percentileSortedAsc(samples: readonly number[], p: number): number {
  if (samples.length === 0) return NaN;
  const n = samples.length;
  const pos = (n - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = samples[lo]!;
  const b = samples[hi]!;
  return lo === hi ? a : a + (b - a) * (pos - lo);
}

async function warmupSequential(run: () => Promise<unknown>, budgetMs: number): Promise<void> {
  const t0 = performance.now();
  while (performance.now() - t0 < budgetMs) {
    await run();
  }
}

/**
 * Sequential calls until `budgetMs` elapses. Durations in **nanoseconds** (`hrtime.bigint()`).
 * Splits the **time-ordered** stream into non-overlapping chunks of `BATCH_SIZE` for median(batch-p90).
 */
async function collectSequentialSamplesNs(
  run: () => Promise<unknown>,
  budgetMs: number
): Promise<{ flatNs: number[]; batchesNs: number[][] }> {
  const flatNs: number[] = [];
  const t0 = performance.now();
  while (performance.now() - t0 < budgetMs) {
    const tStart = process.hrtime.bigint();
    await run();
    flatNs.push(Number(process.hrtime.bigint() - tStart));
  }
  const batchesNs = chunkSequential(flatNs, BATCH_SIZE);
  return { flatNs, batchesNs };
}

function chunkSequential(flat: readonly number[], chunkSize: number): number[][] {
  const batches: number[][] = [];
  for (let i = 0; i + chunkSize <= flat.length; i += chunkSize) {
    batches.push(flat.slice(i, i + chunkSize));
  }
  return batches;
}

type LatencySummary = {
  p50Ns: number;
  p90Ns: number;
  meanNs: number;
  medianBatchP90Ns: number;
  samples: number;
  batches: number;
};

function summarizeLatencySamples(flatNs: readonly number[], batchesNs: readonly number[][]): LatencySummary {
  if (flatNs.length === 0) {
    return { p50Ns: NaN, p90Ns: NaN, meanNs: NaN, medianBatchP90Ns: NaN, samples: 0, batches: 0 };
  }
  const sorted = [...flatNs].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const batchP90sNs =
    batchesNs.length > 0
      ? batchesNs.map((b) =>
          percentileSortedAsc(
            [...b].sort((x, y) => x - y),
            0.9
          )
        )
      : [];
  const sortedBatchP90 = [...batchP90sNs].sort((a, b) => a - b);
  return {
    p50Ns: percentileSortedAsc(sorted, 0.5),
    p90Ns: percentileSortedAsc(sorted, 0.9),
    meanNs: sum / sorted.length,
    medianBatchP90Ns: sortedBatchP90.length > 0 ? percentileSortedAsc(sortedBatchP90, 0.5) : NaN,
    samples: flatNs.length,
    batches: batchesNs.length,
  };
}

function colorEnabled(): boolean {
  return process.stdout.isTTY === true && process.env.NO_COLOR === undefined && process.env.FORCE_COLOR !== "0";
}

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[\d;]*m/g, "");
}

function visibleLength(s: string): number {
  return stripAnsi(s).length;
}

function padVisible(s: string, width: number, align: "left" | "right" = "left"): string {
  const pad = Math.max(0, width - visibleLength(s));
  return align === "left" ? s + " ".repeat(pad) : " ".repeat(pad) + s;
}

function style(code: string, text: string): string {
  if (!colorEnabled()) return text;
  return `\x1b[${code}m${text}\x1b[0m`;
}

/** Per-stack hue for the tinybench “Task name” column. */
function colorizeTaskLabel(name: string): string {
  if (!colorEnabled()) return name;
  const rules: [string, string][] = [
    ["v2 doc", "34;1"],
    ["v3 doc", "32;1"],
    ["mapper v3", "36;1"],
    ["electrodb", "35;1"],
    ["dynamoose", "33;1"],
  ];
  for (const [prefix, code] of rules) {
    if (name.startsWith(prefix)) return style(code, name);
  }
  return style("1", name);
}

/** Lower ns is better: green = fastest in column, yellow mid, red slowest. */
function heatLatencyNs(ns: number, colMin: number, colMax: number, formatted: string): string {
  if (!colorEnabled() || colMax <= colMin) return formatted;
  const t = (ns - colMin) / (colMax - colMin);
  const code = t > 0.66 ? "31" : t > 0.33 ? "33" : "32";
  return style(code, formatted);
}

const BOX = {
  tl: "┌",
  tj: "┬",
  tr: "┐",
  lj: "├",
  mj: "┼",
  rj: "┤",
  bl: "└",
  bj: "┴",
  br: "┘",
  v: "│",
  h: "─",
} as const;

function horiz(innerWidths: number[]): string {
  return innerWidths.map((w) => BOX.h.repeat(w + 2)).join(BOX.tj);
}

function fmtNs(n: number): string {
  if (Number.isNaN(n)) return "n/a";
  return Math.round(n).toLocaleString("en-US");
}

function printLatencySummaryTable(results: Map<string, LatencySummary>, measureOnly: boolean): void {
  const names = [...results.keys()];
  if (names.length === 0) return;

  const keys = ["Task name", "p50 (ns)", "p90 (ns)", "median(batch p90) (ns)", "mean (ns)", "samples", "batches"];
  const rows: string[][] = names.map((name) => {
    const s = results.get(name)!;
    return [
      name,
      fmtNs(s.p50Ns),
      fmtNs(s.p90Ns),
      fmtNs(s.medianBatchP90Ns),
      fmtNs(s.meanNs),
      String(s.samples),
      String(s.batches),
    ];
  });

  const cells: string[][] = [keys, ...rows];
  const widths = keys.map((_, j) => Math.max(...cells.map((row) => visibleLength(row[j])), visibleLength(keys[j])));

  const top = style("2", BOX.tl + horiz(widths) + BOX.tr);
  const sep = style("2", BOX.lj + horiz(widths).replaceAll(BOX.tj, BOX.mj) + BOX.rj);
  const bot = style("2", BOX.bl + horiz(widths).replaceAll(BOX.tj, BOX.bj) + BOX.br);

  const fmtRow = (row: string[], header = false) => {
    const pieces = row.map((cell, j) => {
      const w = widths[j];
      if (header) return padVisible(style("1;36", cell), w);
      if (keys[j] === "Task name") return padVisible(colorizeTaskLabel(cell), w);
      return padVisible(style("37", cell), w);
    });
    return style("2", BOX.v) + " " + pieces.join(" " + style("2", BOX.v) + " ") + " " + style("2", BOX.v);
  };

  console.log("");
  console.log(
    style(
      "1;36",
      `  Per-task results (sequential ${WARMUP_MS}ms warmup, ${MEASURE_MS}ms measure; batch-p90 chunks of ${BATCH_SIZE})`
    )
  );
  console.log(top);
  console.log(fmtRow(keys, true));
  console.log(sep);
  for (const r of rows) {
    console.log(fmtRow(r));
  }
  console.log(bot);
  const legend =
    style("2", "  Task colors: ") +
    (measureOnly ? "" : style("34;1", "v2") + style("2", " · ")) +
    style("32;1", "v3") +
    style("2", " · ") +
    style("36;1", "mapper") +
    style("2", " · ") +
    style("35;1", "electrodb") +
    style("2", " · ") +
    style("33;1", "dynamoose");
  console.log(legend);
  console.log("");
}

function buildNsByOpMap(
  results: Map<string, LatencySummary>,
  pick: "p50Ns" | "p90Ns" | "medianBatchP90Ns"
): Map<string, number> {
  const nsByName = new Map<string, number>();
  for (const [name, s] of results) {
    const v = s[pick];
    if (!Number.isNaN(v)) nsByName.set(name, v);
  }
  return nsByName;
}

function printLatencyMatrixNs(
  nsByName: Map<string, number>,
  measureOnly: boolean,
  title: string,
  ansiTitle: string
): void {
  /** In `--measure-only`, v2 `DocumentClient` is omitted (no supported no-op wire path without a fake client). */
  const stacks = (
    measureOnly
      ? ["v3 doc", "mapper v3", "electrodb", "dynamoose"]
      : ["v2 doc", "v3 doc", "mapper v3", "electrodb", "dynamoose"]
  ) as readonly string[];
  const ops = ["put", "get", "update", "query", "delete"] as const;

  const header = ["Stack", ...ops];
  const dataRows = stacks.map((s) => [
    s,
    ...ops.map((op) => {
      const v = nsByName.get(`${s}: ${op}`);
      return v !== undefined ? Math.round(v).toLocaleString("en-US") : "n/a";
    }),
  ]);

  const numericCols = ops.map((_, colIdx) => {
    const col = stacks.map((s) => nsByName.get(`${s}: ${ops[colIdx]!}`)).filter((n): n is number => n !== undefined);
    if (col.length === 0) return { min: 0, max: 0 };
    return { min: Math.min(...col), max: Math.max(...col) };
  });

  const rawRows = [header, ...dataRows];
  const displayRows: string[][] = rawRows.map((row, ri) =>
    row.map((cell, ci) => {
      if (ri === 0) return style("1;36", cell);
      if (ci === 0) return colorizeTaskLabel(cell);
      const opIdx = ci - 1;
      const key = `${stacks[ri - 1]!}: ${ops[opIdx]!}`;
      const ns = nsByName.get(key);
      if (ns === undefined) return style("2", cell);
      const { min, max } = numericCols[opIdx]!;
      return heatLatencyNs(ns, min, max, cell);
    })
  );

  const widths = header.map((_, j) =>
    Math.max(...rawRows.map((row) => visibleLength(row[j])), visibleLength(header[j]))
  );

  const top = BOX.tl + horiz(widths) + BOX.tr;
  const sep = BOX.lj + horiz(widths).replaceAll(BOX.tj, BOX.mj) + BOX.rj;
  const bot = BOX.bl + horiz(widths).replaceAll(BOX.tj, BOX.bj) + BOX.br;

  const line = (cells: string[]) =>
    BOX.v + " " + cells.map((c, i) => padVisible(c, widths[i]!)).join(" " + BOX.v + " ") + " " + BOX.v;

  console.log(style("1;35", ansiTitle + " — heatmap per column (green = fastest, red = slowest)"));
  console.log(style("2", "  " + top));
  console.log(style("2", "  ") + line(displayRows[0]!));
  console.log(style("2", "  ") + sep);
  for (let r = 1; r < displayRows.length; r++) {
    console.log(style("2", "  ") + line(displayRows[r]!));
  }
  console.log(style("2", "  ") + bot);
  console.log("");

  console.log(style("2", "  Copy-friendly Markdown (no ANSI):"));
  console.log(style("2", ""));
  console.log(style("2", `  ${title}`));
  console.log(style("2", ""));
  console.log(style("2", "| Stack | " + ops.join(" | ") + " |"));
  console.log(style("2", "| --- | " + ops.map(() => "---").join(" | ") + " |"));
  for (const s of stacks) {
    const cells = ops.map((op) => {
      const v = nsByName.get(`${s}: ${op}`);
      return v !== undefined ? Math.round(v).toLocaleString("en-US") : "n/a";
    });
    console.log(style("2", `| ${s} | ${cells.join(" | ")} |`));
  }
  console.log("");
}

function printFormattedBenchOutput(results: Map<string, LatencySummary>, mode: "measure-only" | "with-local"): void {
  const modeLabel =
    mode === "measure-only"
      ? style("33", "measure-only (no I/O, sequential per-call)")
      : style("36", "DynamoDB Local (sequential per-call)");
  console.log(style("1;37", "\n═══════════════════════════════════════════════════════════════════"));
  console.log(
    style("1;37", "  DynamoDB stack comparison — ") + modeLabel + style("1;37", " (same keys as micro-bench.ts)")
  );
  console.log(style("1;37", "═══════════════════════════════════════════════════════════════════\n"));

  printLatencySummaryTable(results, mode === "measure-only");
  const p50Map = buildNsByOpMap(results, "p50Ns");
  const p90Map = buildNsByOpMap(results, "p90Ns");
  const medianBatchP90Map = buildNsByOpMap(results, "medianBatchP90Ns");
  printLatencyMatrixNs(p50Map, mode === "measure-only", "p50 (median) latency (ns)", "  p50 (median) latency (ns)");
  printLatencyMatrixNs(p90Map, mode === "measure-only", "p90 latency (ns)", "  p90 latency (ns)");
  printLatencyMatrixNs(
    medianBatchP90Map,
    mode === "measure-only",
    "median of per-batch p90 (ns)",
    "  median(batch p90) (ns)"
  );
  if (mode === "measure-only") {
    console.log(
      style(
        "2",
        "  Note: v2 DocumentClient tasks are omitted in measure-only (no supported no-network path without a non-representative fake client)."
      )
    );
    console.log("");
  }
}

function buildElectroEntity(docClient: DynamoDBDocumentClient) {
  return new Entity(
    {
      model: { entity: "benchuser", version: "1", service: "cmpbench" },
      attributes: {
        userId: { type: "string", required: true },
        profileKey: { type: "string", required: true },
        name: { type: "string" },
        email: { type: "string" },
        version: { type: "number" },
      },
      indexes: {
        byUser: {
          pk: { field: "pk", composite: ["userId"], template: "${userId}" },
          sk: { field: "sk", composite: ["profileKey"], template: "${profileKey}" },
        },
      },
    },
    { client: docClient, table: TABLE }
  );
}

function buildDynamooseModel() {
  const schema = new dynamoose.Schema({
    pk: { type: String, hashKey: true },
    sk: { type: String, rangeKey: true },
    userId: { type: String },
    profileKey: { type: String },
    name: { type: String },
    email: { type: String },
    version: { type: Number },
  });
  return dynamoose.model("BenchUser", schema, {
    tableName: TABLE,
    create: false,
    waitForActive: false,
  });
}

async function main() {
  if (withLocal && measureOnly) {
    console.error("Use only one of --measure-only or --with-local.");
    process.exit(1);
  }
  if (!withLocal && !measureOnly) {
    console.error(
      "Pick exactly one mode:\n  yarn sample:bench:compare -- --measure-only\n  yarn sample:bench:compare -- --with-local"
    );
    process.exit(1);
  }

  const mode = measureOnly ? "measure-only" : "with-local";

  let docClient: DynamoDBDocumentClient;
  let docV2: AWS.DynamoDB.DocumentClient | undefined;

  if (measureOnly) {
    docClient = noopDocumentClient();
    dynamoose.aws.ddb.set(noopDynamoDbServiceForDynamoose(benchUserItemToAttributeMap(item)));
  } else {
    const { ddbClient, docClient: realDoc } = createLocalClients();
    await ensureUserTable(ddbClient);
    // Dynamoose calls `ddb().putItem` / `getItem` / … on `DynamoDB`, not `DynamoDBClient.send`.
    dynamoose.aws.ddb.set(
      new DynamoDB({
        endpoint: LOCAL_ENDPOINT,
        region: process.env.AWS_REGION ?? "us-east-1",
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "local",
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "local",
        },
      })
    );
    docClient = realDoc;
    docV2 = new AWS.DynamoDB.DocumentClient({
      region: process.env.AWS_REGION ?? "us-east-1",
      endpoint: process.env.DYNAMODB_ENDPOINT ?? "http://localhost:8000",
      credentials: new AWS.Credentials(
        process.env.AWS_ACCESS_KEY_ID ?? "local",
        process.env.AWS_SECRET_ACCESS_KEY ?? "local"
      ),
    });
  }

  if (!measureOnly && docV2 === undefined) {
    throw new Error("Internal: docV2 required when not measure-only");
  }

  const UserTable = userTableHandle(docClient);
  const ElectroUser = buildElectroEntity(docClient);
  const DynUser = buildDynamooseModel();

  if (!measureOnly) {
    await docClient.send(
      new PutCommand({
        TableName: TABLE,
        Item: { ...item },
      })
    );
  }

  type TaskDef = { name: string; run: () => Promise<unknown> };
  const taskDefs: TaskDef[] = [];

  if (!measureOnly) {
    taskDefs.push({
      name: "v2 doc: put",
      run: () => docV2!.put({ TableName: TABLE, Item: { ...item } }).promise(),
    });
  }
  taskDefs.push(
    {
      name: "v3 doc: put",
      run: () =>
        docClient.send(
          new PutCommand({
            TableName: TABLE,
            Item: { ...item },
          })
        ),
    },
    { name: "mapper v3: put", run: () => UserTable.put({ ...row }) },
    { name: "electrodb: put", run: () => ElectroUser.put({ ...row }).go() },
    {
      name: "dynamoose: put",
      run: () =>
        DynUser.create(
          {
            pk,
            sk,
            userId: row.userId,
            profileKey: row.profileKey,
            name: row.name,
            email: row.email,
            version: row.version,
          },
          { overwrite: true }
        ),
    }
  );

  if (!measureOnly) {
    taskDefs.push({
      name: "v2 doc: get",
      run: () => docV2!.get({ TableName: TABLE, Key: { pk, sk } }).promise(),
    });
  }
  taskDefs.push(
    {
      name: "v3 doc: get",
      run: () =>
        docClient.send(
          new GetCommand({
            TableName: TABLE,
            Key: { pk, sk },
          })
        ),
    },
    { name: "mapper v3: get", run: () => UserTable.get({ ...key }) },
    {
      name: "electrodb: get",
      run: () => ElectroUser.get({ userId: row.userId, profileKey: row.profileKey }).go(),
    },
    { name: "dynamoose: get", run: () => DynUser.get({ pk, sk }) }
  );

  if (!measureOnly) {
    taskDefs.push({
      name: "v2 doc: update",
      run: () =>
        docV2!
          .update({
            TableName: TABLE,
            Key: { pk, sk },
            UpdateExpression: "SET #n0 = :v0, #n1 = :v1",
            ExpressionAttributeNames: { "#n0": "name", "#n1": "version" },
            ExpressionAttributeValues: { ":v0": "Bob", ":v1": 2 },
          })
          .promise(),
    });
  }
  taskDefs.push(
    {
      name: "v3 doc: update",
      run: () =>
        docClient.send(
          new UpdateCommand({
            TableName: TABLE,
            Key: { pk, sk },
            UpdateExpression: "SET #n0 = :v0, #n1 = :v1",
            ExpressionAttributeNames: { "#n0": "name", "#n1": "version" },
            ExpressionAttributeValues: { ":v0": "Bob", ":v1": 2 },
          })
        ),
    },
    {
      name: "mapper v3: update",
      run: () => UserTable.update({ ...key }, { set: { name: "Bob", version: 2 } }),
    },
    {
      name: "electrodb: update",
      run: () =>
        ElectroUser.patch({ userId: row.userId, profileKey: row.profileKey }).set({ name: "Bob", version: 2 }).go(),
    },
    { name: "dynamoose: update", run: () => DynUser.update({ pk, sk }, { name: "Bob", version: 2 }) }
  );

  if (!measureOnly) {
    taskDefs.push({
      name: "v2 doc: query",
      run: () =>
        docV2!
          .query({
            TableName: TABLE,
            KeyConditionExpression: "#pk = :pk",
            ExpressionAttributeNames: { "#pk": "pk" },
            ExpressionAttributeValues: { ":pk": pk },
          })
          .promise(),
    });
  }
  taskDefs.push(
    {
      name: "v3 doc: query",
      run: () =>
        docClient.send(
          new QueryCommand({
            TableName: TABLE,
            KeyConditionExpression: "#pk = :pk",
            ExpressionAttributeNames: { "#pk": "pk" },
            ExpressionAttributeValues: { ":pk": pk },
          })
        ),
    },
    { name: "mapper v3: query", run: () => UserTable.query({ userId: row.userId }) },
    {
      name: "electrodb: query",
      run: () => ElectroUser.query.byUser({ userId: row.userId }).go(),
    },
    { name: "dynamoose: query", run: () => DynUser.query("pk").eq(pk).exec() }
  );

  if (!measureOnly) {
    taskDefs.push({
      name: "v2 doc: delete",
      run: () => docV2!.delete({ TableName: TABLE, Key: { pk, sk } }).promise(),
    });
  }
  taskDefs.push(
    {
      name: "v3 doc: delete",
      run: () =>
        docClient.send(
          new DeleteCommand({
            TableName: TABLE,
            Key: { pk, sk },
          })
        ),
    },
    { name: "mapper v3: delete", run: () => UserTable.delete({ ...key }) },
    {
      name: "electrodb: delete",
      run: () => ElectroUser.delete({ userId: row.userId, profileKey: row.profileKey }).go(),
    },
    { name: "dynamoose: delete", run: () => DynUser.delete({ pk, sk }) }
  );

  const results = new Map<string, LatencySummary>();
  let ti = 0;
  for (const def of taskDefs) {
    ti++;
    process.stderr.write(
      `\r  Sampling ${ti}/${taskDefs.length}: ${def.name}${" ".repeat(Math.max(0, 64 - def.name.length))}`
    );
    await warmupSequential(def.run, WARMUP_MS);
    const { flatNs, batchesNs } = await collectSequentialSamplesNs(def.run, MEASURE_MS);
    results.set(def.name, summarizeLatencySamples(flatNs, batchesNs));
  }
  process.stderr.write("\r" + " ".repeat(80) + "\r");

  printFormattedBenchOutput(results, mode);

  if (!measureOnly) {
    /** Restore row for a clean table (delete benches may have removed the item). */
    await docClient.send(
      new PutCommand({
        TableName: TABLE,
        Item: { ...item },
      })
    );
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
