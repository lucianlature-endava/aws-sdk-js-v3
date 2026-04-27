/**
 * Cross-stack micro-benchmark for a performance comparison matrix:
 * **AWS SDK v2** `DocumentClient`, **v3** `DynamoDBDocumentClient` (document path),
 * **PoC DataMapper** (`@aws-sdk/lib-dynamodb-data-mapper`), **DynamoDB-Toolbox** (v2 `Entity`/`Table` + `build`/`send`),
 * **ElectroDB**, **Dynamoose**.
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
 * Pick **exactly one** mode (mutually exclusive): **`--measure-only`** · **`--with-local`** · **`--with-aws`**
 *
 * - **`--measure-only`** — **shared** v3 `DynamoDB` client built with a **fake `requestHandler`**
 *   that returns canned DynamoDB JSON 1.0 response bodies per `X-Amz-Target` operation, so the
 *   **entire** v3 middleware chain executes (serialize → sign/retry → deserialize) **without any
 *   socket or DynamoDB Local RTT**. `DynamoDBDocumentClient.from(sharedDdb)` gives doc-client
 *   callers (v3 doc, mapper, Toolbox, ElectroDB) unmarshalled plain-JS items; Dynamoose is
 *   pointed at the **same** underlying client via `dynamoose.aws.ddb.set(sharedDdb)` and receives
 *   `AttributeValue`-shaped items from raw `DynamoDB.*Item(...)` calls. **v2 `DocumentClient`**
 *   tasks are **omitted** (no faithful no-network path). Isolates **full SDK path (minus HTTP) +
 *   doc-client marshal/unmarshal + each library's mapping** cost.
 * - **`--with-local`** — real RTT to **[DynamoDB Local](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.html)**
 *   on port 8000 (`docker compose up -d`). Dominated by Local/JVM latency.
 * - **`--with-aws`** (or **`MICRO_BENCH_AWS=1`**, **`BENCH_USE_AWS=1`**) — regional **DynamoDB** in the
 *   account/region from the default **credential provider chain** (no `DYNAMODB_ENDPOINT`). **Table**:
 *   **`BENCH_DYNAMODB_TABLE`** (default `UserTable`). **`BENCH_ENSURE_TABLE`**: unset on AWS ⇒ **verify
 *   only** (no `CreateTable`); set **`1`** to auto-create. After the matrix, **`--paired-with-aws`**
 *   (**`MICRO_BENCH_PAIRED_AWS=1`**) runs the same-window **v3 doc vs mapper** pairing against AWS (same
 *   role as **`--paired-with-local`** on Local).
 *
 * **Timing model (what `run()` includes):** The harness builds **one** shared service client (and
 * **`DynamoDBDocumentClient.from`**) **before** the matrix; **DataMapper / Toolbox / Electro / Dynamoose**
 * handles are also built **once**. Each task’s **`run()`** times only the **operation** (`send`, `go`, …),
 * not **`new DynamoDBClient`** / **`from`** / schema compilation. That targets **steady-state** cost in a
 * **long-lived** process (container reuse, shared module scope): “given clients already exist, what does
 * each extra call cost?” Moving client construction **into** `run()` would blend in **alloc + middleware
 * setup** and, if you recreate the low-level client every iteration, **socket churn** on Local — a
 * different benchmark (cold path / bootstrap) that usually **drowns** library comparisons. The default
 * matrix stays **hot-path**; opt into cold timing with **`--cold-client`** (see below).
 *
 * **`--cold-client`** (or **`MICRO_BENCH_COLD_CLIENT=1`**) — each timed sample runs **`new` low-level
 * client → `DynamoDBDocumentClient.from` → fresh mapper / Toolbox / Electro handles on that doc client →
 * one op → `destroy()`** (measure-only, Local, and AWS). **Dynamoose:** fresh service **`DynamoDB`** +
 * **`dynamoose.aws.ddb.set`** per sample. **v2** `DocumentClient`: recreated per sample. **No**
 * matrix prime and **no** per-task warmup. Incompatible with **`--paired-breakdown`** /
 * **`--paired-with-local`**, and **`--paired-with-aws`**. **`--breakdown`** in measure-only still works (each new client is patched per
 * sample).
 *
 * Run from package root:
 *   `yarn sample:bench:compare -- --measure-only`
 *   `yarn sample:bench:compare -- --with-local`
 *   `yarn sample:bench:compare -- --with-aws`
 *   `yarn sample:bench:compare -- --measure-only --cold-client`
 *
 * **Orchestration:** `yarn sample:bench:workflow` runs **TinyBench** smoke (`minimal-query-bench.ts`) then
 * **measure-only** and **paired** passes here; `yarn sample:bench:workflow:full` appends **paired-with-local**.
 *   `yarn sample:bench:compare -- --measure-only --breakdown` (see below)
 *
 * **`--breakdown`** (requires **`--measure-only`**) — wraps **`ddb.send`** and **`DynamoDBDocumentClient.send`**
 *   (separate instances; doc stacks never call `ddb.send`) to record **SDK `send` wall time** (full
 *   Smithy stack + doc command merge + fake HTTP handler) vs **time inside the fake
 *   `requestHandler.handle`** (JSON stringify + `Readable`). **Library time** ≈ `total − send` when
 *   each `run()` performs one underlying `send` (true here). Optional **`--breakdown-file=path`** or
 *   **`MICRO_BENCH_BREAKDOWN_FILE`** writes the Markdown table to a file. Env
 *   **`MICRO_BENCH_BREAKDOWN=1`** enables breakdown without a CLI flag.
 *   **`--paired-breakdown`** (with **`--measure-only --breakdown`**) — after the main matrix, runs **v3 doc** and
 *   **mapper v3** in the **same** measure window per op and prints a second breakdown table + **Δsdk** (mapper−raw
 *   `send` per iteration). Default call order is **raw first, then mapper** each iteration. Use
 *   **`--paired-order=mapper-first`** or **`alternate`** (or **`MICRO_BENCH_PAIRED_ORDER`**) to test whether slot order
 *   biases **mean sdk**; **Δsdk** is always mapper−raw regardless of order. Env **`MICRO_BENCH_PAIRED=1`** enables
 *   paired mode. **`yarn sample:bench:compare:paired`** runs this mode.
 *   **`--paired-with-local`** — selects **with-local** mode (same as **`--with-local`**; explicit flag optional).
 *   After the matrix, re-runs **v3 doc** and **mapper v3** in the **same** measure window per op against
 *   **DynamoDB Local** so **p50 / mean** for those two are comparable (standalone matrix rows still differ by **batch**
 *   JVM/GC/OS noise). Env **`MICRO_BENCH_PAIRED_LOCAL=1`**. Mutually exclusive with **`--paired-breakdown`**.
 *   **`--paired-order`** applies here too. **`yarn sample:bench:compare:paired-local`** runs **`--paired-with-local`** only.
 *   **`--repeats=N`** (or **`MICRO_BENCH_REPEATS=N`**, clamped to `[1, 25]`) — applies to **both** paired modes.
 *   Runs the paired loop **K times** with fresh warmup/measure per op/run, then prints a **K-run invariant summary**
 *   with `p50 Δ min | med | max`, `Δ>0 min | med | max`, `sign z min | med | max`, and **runs passing** per op.
 *   Invariants:
 *   - **Δtotal** (measure-only paired) and **Δwall** (paired-with-local): **strict** = p50 \> 0, Δ\>0 majority, sign z ≥ Z.
 *     **Z** defaults to **2** (measure-only) or **1.65** (paired-with-local) unless **`MICRO_BENCH_INVARIANT_SIGN_Z_MIN`** is set.
 *     **Soft (Local):** K-run table also shows **pass soft** = p50 \> 0 and majority Δ \> 0 (no sign-z gate) — more greens on Local.
 *   - **Δsdk** (measure-only paired): **|sign z| ≤ 2** per run — same client path; nonzero bias = slot/GC asymmetry.
 *   Per-iteration tables print the **last** run when `K > 1`; the summary table tells you whether the invariant
 *   held on every run on every op. **`yarn sample:bench:compare:paired:repeats`** runs `K=5` by default.
 *   **Display:** **`--ms`** or **`MICRO_BENCH_MS=1`** prints latencies in **milliseconds** (timings are still taken in ns).
 *   **Jitter / windows:** **`MICRO_BENCH_WARMUP_MS`** and **`MICRO_BENCH_MEASURE_MS`** (positive integers,
 *   capped at 120000) override the defaults without editing this file. **`MICRO_BENCH_GC=1`** runs
 *   `global.gc()` after each task’s warmup (before measure) when Node is started with **`--expose-gc`**
 *   — can narrow heap-driven variance between sequential rows at the cost of a longer run.
 * **`MICRO_BENCH_INVARIANT_SIGN_Z_MIN`** (default **2**, range **0.5–10**) — K-run **mapper-slower** invariant
 *   for **Δtotal** / **Δwall** (sign-test **z** vs this minimum). **`yarn sample:bench:compare:paired-local:tuned`**
 *   sets longer warmup/measure, repeats, and GC to help the default threshold pass on Local.
 *
 * **CPU profiling (manual)** — for flame charts of *where* samples land inside Node and dependencies,
 *   from `lib/lib-dynamodb-data-mapper`: `yarn sample:bench:compare:cpu-prof` (writes JSON under `.cpu-prof/`),
 *   or: `node --cpu-prof --cpu-prof-dir=./.cpu-prof ./node_modules/tsx/dist/cli.mjs samples/micro-bench-comparison.ts --measure-only`
 *   For **dense** samples on one op (not the 25-way matrix), use `yarn sample:bench:cpu-prof-harness` (`samples/cpu-prof-harness.ts`).
 *   Open the generated `CPU.*.cpuprofile` in Chrome DevTools → Performance → Load profile, or run
 *   `node --prof` / `node --prof-process` for line-level summaries. Use a **short** measure window
 *   (temporarily reduce `MICRO_BENCH_MEASURE_MS` or `MEASURE_MS` in this file) so the profile is not dominated by idle tail.
 *
 * Notes:
 * - **ElectroDB** persists `__edb_e__` / `__edb_v__` on items (library metadata); update path
 *   refreshes those alongside business fields (realistic ElectroDB wire shape).
 * - Before the matrix, the harness **primes** the shared `DynamoDBDocumentClient` with the same
 *   raw v3 `Put`/`Get`/…/`Delete` sequence used by the **v3 doc** row. Without that, the **first**
 *   timed cell (`v3 doc: put`) pays V8 + SDK cold-start while stacks that reuse `docClient` later
 *   look artificially faster — even though **mapper v3** adds schema work on top of the same
 *   `send(PutCommand)` path.
 * - **Ordering:** **v3 doc** is the **raw** `DynamoDBDocumentClient` path; **mapper v3** is the same
 *   client plus **schema** work (`physicalKeyFromRow`, key merge, etc.). On the same op, **higher ns =
 *   slower**; expect **mapper v3 p50 ≥ v3 doc p50** (mapper not faster than raw). The harness prints
 *   a warning if that is violated (usually JIT/GC noise — re-run or increase `MICRO_BENCH_WARMUP_MS` /
 *   `MICRO_BENCH_MEASURE_MS` or the constants in this file).
 * - **with-local `query` / `get`:** Standalone matrix cells compare **different** measure windows per row;
 *   Local RTT variance often inverts **v3 doc** vs **mapper v3** p50 there while the heatmap still looks “accurate” overall.
 *   Trust **Paired with-local** for that pair, not one cell.
 * - **`--breakdown` interpretation:** Each task has its **own** warmup+measure window. **Mean sdk**
 *   can differ by ~1–2% between **v3 doc** and **mapper v3** on the same op (e.g. get) even though
 *   both end in the same `docClient.send(GetCommand)` — **batch-to-batch jitter** (GC, scheduling),
 *   not a separate “mapper SDK” in the client. Use the **sdk p50** column (median per-iteration `send`
 *   wall) as a less tail-sensitive view than **mean sdk**. **Mean lib** should be higher for mapper (key prep +
 *   `stripPhysicalKeys` on reads). If **mean total** is lower for mapper while **lib** is higher,
 *   **mean sdk** was simply smaller in that window; this table does **not** split `sdk` into
 *   marshaller/signer/JSON (use CPU profiling for that).
 * - Numbers are **environment-specific**; not a production SLA.
 */

import { DynamoDB } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import AWS from "aws-sdk";
import { Entity } from "dynamodb-toolbox/entity";
import { DeleteItemCommand } from "dynamodb-toolbox/entity/actions/delete";
import { GetItemCommand } from "dynamodb-toolbox/entity/actions/get";
import { PutItemCommand } from "dynamodb-toolbox/entity/actions/put";
import { UpdateItemCommand } from "dynamodb-toolbox/entity/actions/update";
import { item as toolboxItemSchema } from "dynamodb-toolbox/schema/item";
import { number } from "dynamodb-toolbox/schema/number";
import { string } from "dynamodb-toolbox/schema/string";
import { Table } from "dynamodb-toolbox/table";
import { QueryCommand as ToolboxQueryCommand } from "dynamodb-toolbox/table/actions/query";
import dynamoose from "dynamoose";
import { Entity as ElectroEntity } from "electrodb";
import { appendFileSync, writeFileSync } from "node:fs";
import process from "node:process";

import { createLocalClients } from "../src/client";
import { physicalKeyFromRow } from "../src/schema";
import { createAwsBenchClients, createAwsBenchDynamoService, resolveBenchAwsRegion } from "./bench-network";
import {
  buildMeasureOnlySharedDynamoDb as buildMeasureOnlySharedDynamoDbShared,
  userItemToAttributeMap,
} from "./measure-only-client";
import { ensureBenchTable, USER_TABLE_NAME, UserSchema, userTableHandle } from "./user-table";

const TABLE = USER_TABLE_NAME;

/** Same defaults as `createLocalClients()` — duplicated so Dynamoose gets a `DynamoDB` service instance. */
const LOCAL_ENDPOINT = process.env.DYNAMODB_ENDPOINT ?? "http://localhost:8000";

/** Logical row + physical keys (same wire item as `micro-bench.ts`). */
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

const measureOnly = process.argv.includes("--measure-only");
/** After the Local matrix: same-window **v3 doc** vs **mapper v3** on DynamoDB Local (wall time only). */
const wantPairedWithLocal =
  process.argv.includes("--paired-with-local") || process.env.MICRO_BENCH_PAIRED_LOCAL === "1";
/** Same-window paired run against **AWS DynamoDB** (requires `--with-aws` or implied by this flag). */
const wantPairedWithAws =
  process.argv.includes("--paired-with-aws") || process.env.MICRO_BENCH_PAIRED_AWS === "1";
/** Real AWS account/region (default credential chain; no `DYNAMODB_ENDPOINT`). */
const withAws =
  process.argv.includes("--with-aws") ||
  process.env.MICRO_BENCH_AWS === "1" ||
  process.env.BENCH_USE_AWS === "1" ||
  (wantPairedWithAws && !measureOnly);
/** Implies Local when `--paired-with-local` is used (no redundant `--with-local` required). */
const withLocal =
  !withAws &&
  (process.argv.includes("--with-local") || (wantPairedWithLocal && !measureOnly));
const wantBreakdown =
  process.argv.includes("--breakdown") || process.env.MICRO_BENCH_BREAKDOWN === "1";
const wantPairedBreakdown =
  process.argv.includes("--paired-breakdown") || process.env.MICRO_BENCH_PAIRED === "1";
/** Each sample: construct clients + library handles + one op (see file TSDoc). */
const wantColdClient =
  process.argv.includes("--cold-client") || process.env.MICRO_BENCH_COLD_CLIENT === "1";
const breakdownFileArg = process.argv.find((a) => a.startsWith("--breakdown-file="));
const breakdownOutFile =
  breakdownFileArg?.slice("--breakdown-file=".length).trim() ||
  process.env.MICRO_BENCH_BREAKDOWN_FILE?.trim() ||
  null;

/** When set, all **printed** latencies use **milliseconds** (values are still measured in ns internally). */
const displayTimeMs = process.argv.includes("--ms") || process.env.MICRO_BENCH_MS === "1";

function benchUnitLabel(): "ms" | "ns" {
  return displayTimeMs ? "ms" : "ns";
}

/** Formats a duration stored in **nanoseconds** for tables and Markdown. */
function fmtNs(n: number): string {
  if (Number.isNaN(n)) return "n/a";
  if (displayTimeMs) {
    const ms = n / 1e6;
    return ms.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 6 });
  }
  return Math.round(n).toLocaleString("en-US");
}

/** Which stack runs first inside each paired iteration (`--paired-breakdown` only). */
type PairedOrder = "raw-first" | "mapper-first" | "alternate";

function parsePairedOrderFlag(): PairedOrder {
  const arg = process.argv.find((a) => a.startsWith("--paired-order="))?.slice("--paired-order=".length).trim();
  const env = process.env.MICRO_BENCH_PAIRED_ORDER?.trim();
  const raw = (arg || env || "raw-first").toLowerCase();
  if (raw === "raw-first" || raw === "mapper-first" || raw === "alternate") return raw;
  console.error(`Invalid --paired-order / MICRO_BENCH_PAIRED_ORDER="${raw}"; use raw-first | mapper-first | alternate`);
  process.exit(1);
}

/** Chunk size for “batch p90 → median” (post-hoc on sequential samples; not concurrent execution). */
const BATCH_SIZE = 25;

function parseEnvPositiveIntMs(key: string, defaultVal: number, maxMs: number): number {
  const raw = process.env[key]?.trim();
  if (!raw || !/^\d+$/.test(raw)) return defaultVal;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return defaultVal;
  return Math.min(n, maxMs);
}

const WARMUP_MS = parseEnvPositiveIntMs("MICRO_BENCH_WARMUP_MS", 400, 120_000);
const MEASURE_MS = parseEnvPositiveIntMs("MICRO_BENCH_MEASURE_MS", 3000, 120_000);

/**
 * K-run repetition for paired sections (`--repeats=N` or `MICRO_BENCH_REPEATS=N`, clamped to [1, 25]).
 * Default `1` (original single-run behaviour). When `> 1`, each of the 5 BENCH_OPS is re-run K times
 * with its own warmup + measure window, and a **K-run invariant summary** is printed for the right
 * Δ metric (`Δtotal` for measure-only paired; `Δwall` for paired-with-local).
 */
function parseRepeatsFlag(): number {
  const arg = process.argv.find((a) => a.startsWith("--repeats="))?.slice("--repeats=".length).trim();
  const env = process.env.MICRO_BENCH_REPEATS?.trim();
  const raw = arg || env || "1";
  if (!/^\d+$/.test(raw)) return 1;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 25);
}
const REPEATS = parseRepeatsFlag();

/** Default sign-z threshold: **1.65** on paired-with-local (≈ one-sided 5%), **2** elsewhere unless overridden. */
function defaultInvariantSignZMin(): number {
  const pairedLocal =
    process.argv.includes("--paired-with-local") || process.env.MICRO_BENCH_PAIRED_LOCAL === "1";
  return pairedLocal ? 1.65 : 2;
}

/** Sign-test **z** minimum for K-run “mapper slower” invariant (Δtotal / Δwall). */
function parseEnvInvariantSignZMin(): number {
  const raw = process.env.MICRO_BENCH_INVARIANT_SIGN_Z_MIN?.trim();
  if (!raw) return defaultInvariantSignZMin();
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0.5) return defaultInvariantSignZMin();
  return Math.min(n, 10);
}
const INVARIANT_SIGN_Z_MIN = parseEnvInvariantSignZMin();

/** Optional heap normalization between tasks (`MICRO_BENCH_GC=1` + `node --expose-gc`). */
function maybeGcAfterWarmup(): void {
  if (process.env.MICRO_BENCH_GC !== "1") return;
  const g = (globalThis as unknown as { gc?: () => void }).gc;
  if (typeof g === "function") g();
}

const benchUserItemToAttributeMap = (i: BenchUserItem) => userItemToAttributeMap(i);

/**
 * Per `--breakdown` measure window: accumulates `ddb.send` wall time vs time inside the fake HTTP
 * handler (`JSON.stringify` + stream). **Library** time ≈ `totalWall − send` when each `run()` issues
 * exactly one underlying `send` (true for all tasks in this harness).
 */
class BreakdownMeter {
  private recording = false;
  private sdkNsThisSample = 0n;
  private handlerNsThisSample = 0n;

  setRecording(on: boolean): void {
    this.recording = on;
  }

  startSample(): void {
    this.sdkNsThisSample = 0n;
    this.handlerNsThisSample = 0n;
  }

  addSdkNs(ns: bigint): void {
    if (this.recording) this.sdkNsThisSample += ns;
  }

  addHandlerNs(ns: bigint): void {
    if (this.recording) this.handlerNsThisSample += ns;
  }

  peekSample(): { sdkNs: bigint; handlerNs: bigint } {
    return { sdkNs: this.sdkNsThisSample, handlerNs: this.handlerNsThisSample };
  }
}

/**
 * Shared no-I/O v3 `DynamoDB` client used by both `DynamoDBDocumentClient` and Dynamoose in
 * `--measure-only`. Implementation lives in **`./measure-only-client`** and is also used by
 * `minimal-query-bench.ts`. When `meter` is set, this wrapper also patches **`ddb.send`** outside the
 * factory (see `patchSendForBreakdown`) and forwards handler timings via **`onHandlerNs`**.
 */
function buildMeasureOnlySharedDynamoDb(
  avItem: Parameters<typeof buildMeasureOnlySharedDynamoDbShared>[0],
  meter?: BreakdownMeter | null,
): DynamoDB {
  return buildMeasureOnlySharedDynamoDbShared(avItem, {
    endpoint: LOCAL_ENDPOINT,
    onHandlerNs: meter ? (ns) => meter.addHandlerNs(ns) : undefined,
  });
}

/**
 * `DynamoDBDocumentClient` shares the service `middlewareStack` but **`send` is per-instance** —
 * doc stacks call `docClient.send`, which does not invoke `ddb.send`. Patch **both** so breakdown
 * attributes SDK time for raw `DynamoDB.*` (Dynamoose) and for `DynamoDBDocumentClient` paths.
 */
function patchSendForBreakdown(client: { send: (...args: never[]) => Promise<unknown> }, meter: BreakdownMeter): void {
  const origSend = client.send.bind(client) as (...args: never[]) => Promise<unknown>;
  client.send = (async (...args: never[]) => {
    const t0 = process.hrtime.bigint();
    try {
      return await origSend(...args);
    } finally {
      meter.addSdkNs(process.hrtime.bigint() - t0);
    }
  }) as typeof client.send;
}

function destroyDdbClient(client: { destroy: () => void }): void {
  try {
    client.destroy();
  } catch {
    /* ignore */
  }
}

/**
 * **`--cold-client` measure-only:** one fake-handler `DynamoDB` + doc client per sample; optional
 * breakdown patching on both `send`s.
 */
async function runWithFreshMeasureDocStack(
  meter: BreakdownMeter | null,
  work: (docClient: DynamoDBDocumentClient) => Promise<unknown>
): Promise<void> {
  const ddb = buildMeasureOnlySharedDynamoDb(benchUserItemToAttributeMap(item), meter);
  if (meter) {
    patchSendForBreakdown(ddb, meter);
  }
  const dc = DynamoDBDocumentClient.from(ddb);
  if (meter) {
    patchSendForBreakdown(dc, meter);
  }
  try {
    await work(dc);
  } finally {
    destroyDdbClient(ddb);
  }
}

/** **`--cold-client` with-local:** one `DynamoDBClient` + doc client per sample (TCP churn on Local). */
async function runWithFreshLocalDocStack(work: (docClient: DynamoDBDocumentClient) => Promise<unknown>): Promise<void> {
  const { ddbClient, docClient } = createLocalClients();
  try {
    await work(docClient);
  } finally {
    destroyDdbClient(ddbClient);
  }
}

async function runWithFreshAwsDocStack(work: (docClient: DynamoDBDocumentClient) => Promise<unknown>): Promise<void> {
  const { ddbClient, docClient } = createAwsBenchClients();
  try {
    await work(docClient);
  } finally {
    destroyDdbClient(ddbClient);
  }
}

/** Same service client shape as the non-cold Dynamoose branch in `main` (raw `DynamoDB`, not document). */
function newLocalDynamooseServiceClient(): DynamoDB {
  return new DynamoDB({
    endpoint: LOCAL_ENDPOINT,
    region: process.env.AWS_REGION ?? "us-east-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "local",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "local",
    },
  });
}

async function runWithFreshMeasureDynamooseStack(
  meter: BreakdownMeter | null,
  work: () => Promise<unknown>
): Promise<void> {
  const ddb = buildMeasureOnlySharedDynamoDb(benchUserItemToAttributeMap(item), meter);
  if (meter) {
    patchSendForBreakdown(ddb, meter);
  }
  dynamoose.aws.ddb.set(ddb);
  try {
    await work();
  } finally {
    destroyDdbClient(ddb);
  }
}

async function runWithFreshLocalDynamooseStack(work: () => Promise<unknown>): Promise<void> {
  const ddb = newLocalDynamooseServiceClient();
  dynamoose.aws.ddb.set(ddb);
  try {
    await work();
  } finally {
    destroyDdbClient(ddb);
  }
}

async function runWithFreshAwsDynamooseStack(work: () => Promise<unknown>): Promise<void> {
  const ddb = createAwsBenchDynamoService();
  dynamoose.aws.ddb.set(ddb);
  try {
    await work();
  } finally {
    destroyDdbClient(ddb);
  }
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
 * Warm V8 and the shared `docClient.send` stack (and fake-handler branches per `X-Amz-Target`)
 * before any per-stack task runs. Otherwise the first **v3 doc** cell is cold while **mapper v3**
 * (same underlying `PutCommand` after schema mapping) measures on a hot client.
 */
async function primeSharedV3DocBaseline(docClient: DynamoDBDocumentClient, budgetMs: number): Promise<void> {
  const run = async () => {
    await docClient.send(
      new PutCommand({
        TableName: TABLE,
        Item: { ...item },
      })
    );
    await docClient.send(
      new GetCommand({
        TableName: TABLE,
        Key: { pk, sk },
      })
    );
    await docClient.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { pk, sk },
        UpdateExpression: "SET #n0 = :v0, #n1 = :v1",
        ExpressionAttributeNames: { "#n0": "name", "#n1": "version" },
        ExpressionAttributeValues: { ":v0": "Bob", ":v1": 2 },
      })
    );
    await docClient.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "#pk = :pk",
        ExpressionAttributeNames: { "#pk": "pk" },
        ExpressionAttributeValues: { ":pk": pk },
      })
    );
    await docClient.send(
      new DeleteCommand({
        TableName: TABLE,
        Key: { pk, sk },
      })
    );
  };
  await warmupSequential(run, budgetMs);
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

type BreakdownSample = { totalNs: number; sdkNs: number; handlerNs: number };

/**
 * Like `collectSequentialSamplesNs`, but during the measure window records per-iteration
 * `total` wall time vs instrumented `ddb.send` vs fake `requestHandler.handle` (see `BreakdownMeter`).
 */
async function collectSequentialSamplesNsWithBreakdown(
  run: () => Promise<unknown>,
  budgetMs: number,
  meter: BreakdownMeter
): Promise<{
  flatNs: number[];
  batchesNs: number[][];
  breakdownSamples: BreakdownSample[];
}> {
  const flatNs: number[] = [];
  const breakdownSamples: BreakdownSample[] = [];
  meter.setRecording(true);
  const t0 = performance.now();
  while (performance.now() - t0 < budgetMs) {
    meter.startSample();
    const tStart = process.hrtime.bigint();
    await run();
    const totalNs = Number(process.hrtime.bigint() - tStart);
    const { sdkNs, handlerNs } = meter.peekSample();
    breakdownSamples.push({
      totalNs,
      sdkNs: Number(sdkNs),
      handlerNs: Number(handlerNs),
    });
    flatNs.push(totalNs);
  }
  meter.setRecording(false);
  const batchesNs = chunkSequential(flatNs, BATCH_SIZE);
  return { flatNs, batchesNs, breakdownSamples };
}

function rawFirstThisPair(order: PairedOrder, iterationIndex: number): boolean {
  if (order === "raw-first") return true;
  if (order === "mapper-first") return false;
  return iterationIndex % 2 === 0;
}

async function warmupPaired(
  runRaw: () => Promise<unknown>,
  runMapper: () => Promise<unknown>,
  budgetMs: number,
  order: PairedOrder
): Promise<void> {
  const t0 = performance.now();
  let iter = 0;
  while (performance.now() - t0 < budgetMs) {
    if (rawFirstThisPair(order, iter)) {
      await runRaw();
      await runMapper();
    } else {
      await runMapper();
      await runRaw();
    }
    iter++;
  }
}

/**
 * One measure window: two `send`s per iteration, order controlled by `order`.
 * **Δsdk** is always **mapper `send` − raw `send`** (same definition regardless of call order).
 */
async function collectPairedBreakdownSamples(
  runRaw: () => Promise<unknown>,
  runMapper: () => Promise<unknown>,
  budgetMs: number,
  meter: BreakdownMeter,
  order: PairedOrder
): Promise<{
  rawSamples: BreakdownSample[];
  mapperSamples: BreakdownSample[];
  /** Per-iteration `mapper.send − raw.send` (expected ≈ 0: same client path). */
  deltaSdkNs: number[];
  /** Per-iteration `mapper.total − raw.total` (expected \> 0: mapper adds schema work). */
  deltaTotalNs: number[];
  /** Per-iteration `mapper.lib − raw.lib` where lib = total − sdk (expected \> 0 and equal to Δtotal − Δsdk). */
  deltaLibNs: number[];
}> {
  const rawSamples: BreakdownSample[] = [];
  const mapperSamples: BreakdownSample[] = [];
  const deltaSdkNs: number[] = [];
  const deltaTotalNs: number[] = [];
  const deltaLibNs: number[] = [];
  meter.setRecording(true);
  const t0 = performance.now();
  let iter = 0;
  while (performance.now() - t0 < budgetMs) {
    let rawSdk = 0;
    let mapperSdk = 0;
    let rawTotal = 0;
    let mapperTotal = 0;

    const pushRaw = (totalNs: number, peek: { sdkNs: bigint; handlerNs: bigint }) => {
      rawSamples.push({
        totalNs,
        sdkNs: Number(peek.sdkNs),
        handlerNs: Number(peek.handlerNs),
      });
      rawSdk = Number(peek.sdkNs);
      rawTotal = totalNs;
    };
    const pushMapper = (totalNs: number, peek: { sdkNs: bigint; handlerNs: bigint }) => {
      mapperSamples.push({
        totalNs,
        sdkNs: Number(peek.sdkNs),
        handlerNs: Number(peek.handlerNs),
      });
      mapperSdk = Number(peek.sdkNs);
      mapperTotal = totalNs;
    };

    if (rawFirstThisPair(order, iter)) {
      meter.startSample();
      let tStart = process.hrtime.bigint();
      await runRaw();
      let totalNs = Number(process.hrtime.bigint() - tStart);
      let peek = meter.peekSample();
      pushRaw(totalNs, peek);

      meter.startSample();
      tStart = process.hrtime.bigint();
      await runMapper();
      totalNs = Number(process.hrtime.bigint() - tStart);
      peek = meter.peekSample();
      pushMapper(totalNs, peek);
    } else {
      meter.startSample();
      let tStart = process.hrtime.bigint();
      await runMapper();
      let totalNs = Number(process.hrtime.bigint() - tStart);
      let peek = meter.peekSample();
      pushMapper(totalNs, peek);

      meter.startSample();
      tStart = process.hrtime.bigint();
      await runRaw();
      totalNs = Number(process.hrtime.bigint() - tStart);
      peek = meter.peekSample();
      pushRaw(totalNs, peek);
    }

    deltaSdkNs.push(mapperSdk - rawSdk);
    deltaTotalNs.push(mapperTotal - rawTotal);
    deltaLibNs.push(mapperTotal - mapperSdk - (rawTotal - rawSdk));
    iter++;
  }
  meter.setRecording(false);
  return { rawSamples, mapperSamples, deltaSdkNs, deltaTotalNs, deltaLibNs };
}

/**
 * Paired **total wall** time per `await` (for `--with-local`): no `BreakdownMeter`; compares the same
 * clock weather as `collectPairedBreakdownSamples` but only **hrtime** around each call.
 */
async function collectPairedWallSamplesNs(
  runRaw: () => Promise<unknown>,
  runMapper: () => Promise<unknown>,
  budgetMs: number,
  order: PairedOrder
): Promise<{ rawNs: number[]; mapperNs: number[]; deltaTotalNs: number[] }> {
  const rawNs: number[] = [];
  const mapperNs: number[] = [];
  const deltaTotalNs: number[] = [];
  const t0 = performance.now();
  let iter = 0;
  while (performance.now() - t0 < budgetMs) {
    let rawTotal = 0;
    let mapTotal = 0;

    if (rawFirstThisPair(order, iter)) {
      let tStart = process.hrtime.bigint();
      await runRaw();
      rawTotal = Number(process.hrtime.bigint() - tStart);
      rawNs.push(rawTotal);

      tStart = process.hrtime.bigint();
      await runMapper();
      mapTotal = Number(process.hrtime.bigint() - tStart);
      mapperNs.push(mapTotal);
    } else {
      let tStart = process.hrtime.bigint();
      await runMapper();
      mapTotal = Number(process.hrtime.bigint() - tStart);
      mapperNs.push(mapTotal);

      tStart = process.hrtime.bigint();
      await runRaw();
      rawTotal = Number(process.hrtime.bigint() - tStart);
      rawNs.push(rawTotal);
    }

    deltaTotalNs.push(mapTotal - rawTotal);
    iter++;
  }
  return { rawNs, mapperNs, deltaTotalNs };
}

type TaskBreakdownSummary = {
  taskName: string;
  n: number;
  meanTotalNs: number;
  meanLibNs: number;
  meanSdkNs: number;
  /** Median per-iteration `send` wall (same samples as **mean sdk**); less sensitive to GC tails. */
  p50SdkNs: number;
  meanHandlerNs: number;
  meanSdkExclHandlerNs: number;
};

function summarizeBreakdownTask(taskName: string, samples: BreakdownSample[]): TaskBreakdownSummary {
  const n = samples.length;
  if (n === 0) {
    return {
      taskName,
      n: 0,
      meanTotalNs: NaN,
      meanLibNs: NaN,
      meanSdkNs: NaN,
      p50SdkNs: NaN,
      meanHandlerNs: NaN,
      meanSdkExclHandlerNs: NaN,
    };
  }
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / n;
  const libs = samples.map((s) => s.totalNs - s.sdkNs);
  const sdkExcl = samples.map((s) => s.sdkNs - s.handlerNs);
  const sdkSorted = [...samples.map((s) => s.sdkNs)].sort((a, b) => a - b);
  return {
    taskName,
    n,
    meanTotalNs: mean(samples.map((s) => s.totalNs)),
    meanLibNs: mean(libs),
    meanSdkNs: mean(samples.map((s) => s.sdkNs)),
    p50SdkNs: percentileSortedAsc(sdkSorted, 0.5),
    meanHandlerNs: mean(samples.map((s) => s.handlerNs)),
    meanSdkExclHandlerNs: mean(sdkExcl),
  };
}

function formatBreakdownMarkdown(summaries: TaskBreakdownSummary[], modeLabel: string): string {
  const lines: string[] = [];
  lines.push(`## Latency breakdown (${modeLabel})`);
  lines.push("");
  lines.push(
    (displayTimeMs
      ? "Mean **milliseconds** per sample in the **measure** window only (stored as ns ÷ 10⁶). "
      : "Mean **nanoseconds** per sample in the **measure** window only. ") +
      "**lib** ≈ wall time outside `ddb.send` " +
      "(library + doc-client command wrapper before the underlying client). **sdk** = full `ddb.send` " +
      "(serialize, sign, deserialize, …). **fake HTTP** = time inside the fake `requestHandler` only. " +
      "**sdk−HTTP** = sdk minus fake HTTP (middleware + serializer + signer + JSON parse of the canned body)."
  );
  lines.push("");
  lines.push(
    "For **v3 doc** vs **mapper v3**, **higher ns = slower**; expect **mean total(mapper) ≥ mean total(v3 doc)** — mapper adds " +
      "schema work on top of the same `send` path. If mapper is lower, treat as noise or re-run."
  );
  lines.push("");
  lines.push(
    "**Sequential windows:** **mean sdk** can still differ between v3 doc and mapper on the same op " +
      "(~1–2% jitter) because each row is measured separately. Compare **sdk p50** for a median view of " +
      "the same per-iteration `send` wall times. Both use the same `GetCommand`/`PutCommand` " +
      "wire shape; mapper’s **mean lib** should be higher (key derivation + `stripPhysicalKeys` on get). " +
      "If **mean total** is lower for mapper, **mean sdk** was smaller in that batch — not proof of a " +
      "different SDK cost model. This table does not decompose `sdk` further; use `node --cpu-prof` to see " +
      "marshaller vs deserialize vs sign."
  );
  lines.push("");
  lines.push(
    `| task | n | mean total (${benchUnitLabel()}) | mean lib (${benchUnitLabel()}) | mean sdk (${benchUnitLabel()}) | sdk p50 (${benchUnitLabel()}) | mean fake HTTP (${benchUnitLabel()}) | mean sdk−HTTP (${benchUnitLabel()}) |`
  );
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const s of summaries) {
    lines.push(
      `| ${s.taskName} | ${s.n} | ${fmtNs(s.meanTotalNs)} | ${fmtNs(s.meanLibNs)} | ${fmtNs(s.meanSdkNs)} | ${fmtNs(s.p50SdkNs)} | ${fmtNs(s.meanHandlerNs)} | ${fmtNs(s.meanSdkExclHandlerNs)} |`
    );
  }
  lines.push("");
  return lines.join("\n");
}

/** Colored box table on stderr; plain Markdown only when writing `--breakdown-file`. */
function printBreakdownTableColored(summaries: TaskBreakdownSummary[], modeLabel: string): void {
  const u = benchUnitLabel();
  const header = [
    "task",
    "n",
    `mean total (${u})`,
    `mean lib (${u})`,
    `mean sdk (${u})`,
    `sdk p50 (${u})`,
    `fake HTTP (${u})`,
    `sdk−HTTP (${u})`,
  ];
  const nsGetters = [
    (s: TaskBreakdownSummary) => s.meanTotalNs,
    (s: TaskBreakdownSummary) => s.meanLibNs,
    (s: TaskBreakdownSummary) => s.meanSdkNs,
    (s: TaskBreakdownSummary) => s.p50SdkNs,
    (s: TaskBreakdownSummary) => s.meanHandlerNs,
    (s: TaskBreakdownSummary) => s.meanSdkExclHandlerNs,
  ] as const;
  const colMinMax = nsGetters.map((getter) => {
    const vals = summaries.map(getter);
    return { min: Math.min(...vals), max: Math.max(...vals) };
  });

  const rowsPlain: string[][] = summaries.map((s) => [
    s.taskName,
    String(s.n),
    fmtNs(s.meanTotalNs),
    fmtNs(s.meanLibNs),
    fmtNs(s.meanSdkNs),
    fmtNs(s.p50SdkNs),
    fmtNs(s.meanHandlerNs),
    fmtNs(s.meanSdkExclHandlerNs),
  ]);

  const cells: string[][] = [header, ...rowsPlain];
  const widths = header.map((_, j) => Math.max(...cells.map((row) => visibleLength(row[j])), visibleLength(header[j]!)));

  const fmtRow = (row: string[], rowIdx: number, isHeader: boolean): string => {
    const pieces = row.map((cell, j) => {
      const w = widths[j]!;
      if (isHeader) return padVisible(style("1;36", cell), w);
      if (j === 0) return padVisible(colorizeTaskLabel(cell), w);
      if (j === 1) return padVisible(style("2", cell), w);
      const nsIdx = j - 2;
      const ns = nsGetters[nsIdx]!(summaries[rowIdx]!);
      const { min, max } = colMinMax[nsIdx]!;
      const formatted = fmtNs(ns);
      return padVisible(heatLatencyNs(ns, min, max, formatted), w);
    });
    return style("2", BOX.v) + " " + pieces.join(" " + style("2", BOX.v) + " ") + " " + style("2", BOX.v);
  };

  const top = style("2", BOX.tl + horiz(widths) + BOX.tr);
  const sep = style("2", BOX.lj + horiz(widths).replaceAll(BOX.tj, BOX.mj) + BOX.rj);
  const bot = style("2", BOX.bl + horiz(widths).replaceAll(BOX.tj, BOX.bj) + BOX.br);

  console.error("");
  console.error(style("1;37", "═══════════════════════════════════════════════════════════════════"));
  console.error(
    "  " + style("1;36", "Latency breakdown ") + style("36", `(${modeLabel})`)
  );
  console.error(
    "  " +
      style(
        "2",
        "lib ≈ outside send · sdk = full send · fake HTTP = handler body · sdk−HTTP = sdk minus fake HTTP"
      )
  );
  console.error(
    "  " +
      style(
        "2",
        `Heat on numeric cols: green = faster (lower ${benchUnitLabel()}) · yellow · red = slower — per column min/max.`
      )
  );
  if (modeLabel.includes("paired")) {
    const orderHint = modeLabel.includes("mapper-first")
      ? "Each iteration: **mapper first**, then raw (see `--paired-order`)."
      : modeLabel.includes("alternate")
        ? "Each iteration: **alternates** who runs first (`--paired-order=alternate`)."
        : "Each iteration: **raw first**, then mapper (default).";
    console.error(
      "  " +
        style(
          "2",
          "Same-window rows: **mean sdk** / **sdk p50** are directly comparable between v3 doc and mapper v3. " +
            "Expect **mean lib** higher on mapper; **mean total** may still cross from call order. " +
            orderHint +
            " See **Δsdk** for mapper−raw `send` per pair."
        )
    );
  } else {
    console.error(
      "  " +
        style(
          "2",
          "Why can mapper look faster on get? Each row = its own measure window. mean sdk can jitter ~1–2% vs v3 doc " +
            "even for the same GetCommand path; **sdk p50** is usually closer between rows. mean lib should be higher for mapper. " +
            "Lower mean total then means sdk landed lower that batch — not a proven cheaper SDK path. " +
            "Use **`--paired-breakdown`** for v3 vs mapper in one window, or longer MICRO_BENCH_MEASURE_MS, MICRO_BENCH_GC=1 + node --expose-gc, idle CPU."
        )
    );
  }
  console.error(top);
  console.error(fmtRow(header, 0, true));
  console.error(sep);
  rowsPlain.forEach((row, i) => {
    console.error(fmtRow(row, i, false));
  });
  console.error(bot);
  console.error("");
}

function emitBreakdownOutput(
  summaries: TaskBreakdownSummary[],
  modeLabel: string,
  outFile: string | null
): void {
  printBreakdownTableColored(summaries, modeLabel);
  if (outFile) {
    writeFileSync(outFile, formatBreakdownMarkdown(summaries, modeLabel), "utf8");
    console.error(style("32", `  [Wrote plain Markdown breakdown to ${outFile}]`));
    console.error("");
  }
}

const BENCH_OPS = ["put", "get", "update", "query", "delete"] as const;

/**
 * **mapper v3** uses the same `DynamoDBDocumentClient` as **v3 doc** but adds schema mapping; **higher
 * ns = slower**. Expect **p50(mapper) ≥ p50(v3 doc)** and **mean total(mapper) ≥ mean total(v3 doc)**;
 * violations mean mapper measured faster (lower ns) than raw — usually noise; flag it.
 */
function warnMapperV3ShouldNotBeatRawV3Doc(
  results: Map<string, LatencySummary>,
  breakdownSummaries?: TaskBreakdownSummary[],
  /** When set, violations below are about **standalone** matrix rows only; paired table above is fairer for v3 vs mapper. */
  pairedBreakdownRan?: boolean,
  /** Same-window paired wall (**with-local** or **with-aws**) was printed — fairer v3 vs mapper than the standalone matrix. */
  pairedWallRan?: boolean,
  /** Cold path bundles `from` + library setup with the op; skip hot-path matrix invariant (incompatible with paired modes). */
  coldClient?: boolean
): void {
  if (coldClient) {
    console.error("");
    console.error(
      "  " +
        style(
          "2",
          "[bench] Matrix **mapper ≥ raw** check skipped (`--cold-client`): timed sample = **client + handle build + one op**."
        )
    );
    console.error(
      "  " +
        style(
          "2",
          "p50 can invert vs hot-path / paired expectations; **`--paired-breakdown`** and **`--paired-with-local`** are unavailable here."
        )
    );
    console.error("  " + style("2", "Re-run **without** `--cold-client` for the mapper-vs-raw invariant."));
    console.error("");
    return;
  }

  const lines: string[] = [];

  for (const op of BENCH_OPS) {
    const raw = results.get(`v3 doc: ${op}`);
    const mapper = results.get(`mapper v3: ${op}`);
    if (raw && mapper && mapper.p50Ns < raw.p50Ns) {
      lines.push(
        `  ${op}: p50(mapper)=${fmtNs(mapper.p50Ns)} ${benchUnitLabel()} < p50(v3 doc)=${fmtNs(raw.p50Ns)} ${benchUnitLabel()} (matrix; expect p50(mapper) ≥ p50(raw))`
      );
    }
  }

  if (breakdownSummaries && breakdownSummaries.length > 0) {
    for (const op of BENCH_OPS) {
      const raw = breakdownSummaries.find((s) => s.taskName === `v3 doc: ${op}`);
      const mapper = breakdownSummaries.find((s) => s.taskName === `mapper v3: ${op}`);
      if (raw && mapper && mapper.meanTotalNs < raw.meanTotalNs) {
        lines.push(
          `  ${op}: mean total(mapper)=${fmtNs(mapper.meanTotalNs)} ${benchUnitLabel()} < mean total(v3 doc)=${fmtNs(raw.meanTotalNs)} ${benchUnitLabel()} (breakdown; expect mapper ≥ raw)`
        );
      }
    }
  }

  if (lines.length === 0) return;

  console.error("");
  console.error(
    "  " +
      style("1;33", "▸") +
      " " +
      style("1;37", "[bench] Invariant") +
      " " +
      style(
        "2",
        "mapper v3 p50 / mean total should ≥ v3 doc per op (ns; higher = slower; same client + DataMapper adds work)"
      )
  );
  console.error("  " + style("1;31", "Violations:"));
  for (const l of lines) {
    console.error("    " + style("31", "• ") + style("37", l.trim()));
  }
  console.error(
    "    " +
      style(
        "2",
        pairedBreakdownRan
          ? "These lines compare **standalone** sequential windows (different batches than the **paired** table above). For v3 doc vs mapper v3, trust the **paired** rows + **Δsdk**; standalone jitter can still violate this check. Otherwise: raise MICRO_BENCH_WARMUP_MS / MICRO_BENCH_MEASURE_MS, MICRO_BENCH_GC=1 + node --expose-gc, idle CPU."
          : pairedWallRan
            ? "These lines are **standalone** matrix rows; RTT/GC jitter can invert v3 vs mapper. For that pair, trust the **paired wall** tables above (**paired-with-local** or **paired-with-aws** + **Δ wall**)."
            : "Usually JIT/GC noise — use `--paired-breakdown` (measure-only), `--paired-with-local` (Local), or `--paired-with-aws`, or raise MICRO_BENCH_WARMUP_MS / MICRO_BENCH_MEASURE_MS, MICRO_BENCH_GC=1 + node --expose-gc, idle CPU."
      )
  );
  console.error("");
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
  if (process.env.NO_COLOR !== undefined || process.env.FORCE_COLOR === "0") return false;
  return process.stdout.isTTY === true || process.stderr.isTTY === true;
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
    ["toolbox", "96;1"],
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

type PairedDeltaRow = {
  op: string;
  nPairs: number;
  meanDeltaSdkNs: number;
  p50DeltaSdkNs: number;
  p90DeltaSdkNs: number;
  /** `#{ Δ > 0 }` — ignores exact ties. */
  nPositive: number;
  /** `nPositive / (#{ Δ > 0 } + #{ Δ < 0 })` — tie-free fraction in [0, 1]. */
  fracPositive: number;
  /**
   * Normal-approximation **sign-test z** for H0: median(Δ) = 0 using tie-free count.
   * `|z|` ≳ 2 ⇒ reject at ~5% two-sided; ≳ 3 ⇒ effectively certain. Works alongside `p50 Δ`.
   */
  signZ: number;
};

/**
 * Summarizes one per-iteration paired Δ stream. **Δsdk** should have `p50 ≈ 0` and `fracPositive ≈ 0.5`
 * (shared `send` path); **Δtotal / Δlib / Δwall** should have `p50 > 0` and `fracPositive > 0.5` for the
 * mapper-not-faster invariant to hold.
 */
function summarizePairedDelta(op: string, deltaNs: number[]): PairedDeltaRow {
  const n = deltaNs.length;
  if (n === 0) {
    return {
      op,
      nPairs: 0,
      meanDeltaSdkNs: NaN,
      p50DeltaSdkNs: NaN,
      p90DeltaSdkNs: NaN,
      nPositive: 0,
      fracPositive: NaN,
      signZ: NaN,
    };
  }
  const sorted = [...deltaNs].sort((a, b) => a - b);
  const mean = deltaNs.reduce((a, b) => a + b, 0) / n;
  let nPos = 0;
  let nNeg = 0;
  for (const d of deltaNs) {
    if (d > 0) nPos++;
    else if (d < 0) nNeg++;
  }
  const nNonZero = nPos + nNeg;
  const fracPositive = nNonZero > 0 ? nPos / nNonZero : NaN;
  const signZ =
    nNonZero > 0 ? (nPos - nNonZero / 2) / Math.sqrt(nNonZero / 4) : NaN;
  return {
    op,
    nPairs: n,
    meanDeltaSdkNs: mean,
    p50DeltaSdkNs: percentileSortedAsc(sorted, 0.5),
    p90DeltaSdkNs: percentileSortedAsc(sorted, 0.9),
    nPositive: nPos,
    fracPositive,
    signZ,
  };
}

function fmtFrac(n: number): string {
  if (Number.isNaN(n)) return "n/a";
  return n.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function fmtSignedNumber(n: number): string {
  if (Number.isNaN(n)) return "n/a";
  const s = n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n > 0 && !s.startsWith("+") ? `+${s}` : s;
}

/**
 * Shape of a "paired Δ" table. `symbol` is e.g. `Δsdk`, `Δtotal`, `Δlib`, `Δ wall`; `expectation` is
 * `"≈0"` (null hypothesis) or `">0"` (invariant must hold) — drives the stderr title and pass
 * rendering.
 */
type PairedDeltaTableSpec = {
  symbol: string;
  title: string;
  subtitle: string;
  expectation: "≈0" | ">0";
};

function formatPairedDeltaMarkdownWithSpec(
  rows: readonly PairedDeltaRow[],
  spec: PairedDeltaTableSpec
): string {
  const lines: string[] = [];
  const u = benchUnitLabel();
  lines.push(`## ${spec.title} (${u})`);
  lines.push("");
  lines.push(spec.subtitle);
  lines.push("");
  lines.push(
    `| op | pairs | mean ${spec.symbol} (${u}) | p50 ${spec.symbol} (${u}) | p90 ${spec.symbol} (${u}) | Δ>0 | sign z |`
  );
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const r of rows) {
    lines.push(
      `| ${r.op} | ${r.nPairs} | ${fmtNs(r.meanDeltaSdkNs)} | ${fmtNs(r.p50DeltaSdkNs)} | ${fmtNs(r.p90DeltaSdkNs)} | ${fmtFrac(r.fracPositive)} | ${fmtSignedNumber(r.signZ)} |`
    );
  }
  lines.push("");
  lines.push(
    `_Expected: ${spec.expectation === ">0" ? "**p50 > 0** and **Δ>0 > 0.5** with **sign z ≫ 0** — mapper adds lib work on top of raw." : "**p50 ≈ 0** and **Δ>0 ≈ 0.5** (|sign z| ≲ 2) — same client path; nonzero bias = slot/GC asymmetry, tune warmup/GC/order."}_`
  );
  lines.push("");
  return lines.join("\n");
}

function printPairedDeltaTableWithSpec(
  rows: readonly PairedDeltaRow[],
  spec: PairedDeltaTableSpec
): void {
  const u = benchUnitLabel();
  const header = [
    "op",
    "pairs",
    `mean ${spec.symbol} (${u})`,
    `p50 ${spec.symbol} (${u})`,
    `p90 ${spec.symbol} (${u})`,
    "Δ>0",
    "sign z",
  ];
  const data = rows.map((r) => [
    r.op,
    String(r.nPairs),
    fmtNs(r.meanDeltaSdkNs),
    fmtNs(r.p50DeltaSdkNs),
    fmtNs(r.p90DeltaSdkNs),
    fmtFrac(r.fracPositive),
    fmtSignedNumber(r.signZ),
  ]);
  const cells: string[][] = [header, ...data];
  const widths = header.map((_, j) =>
    Math.max(...cells.map((row) => visibleLength(row[j]!)), visibleLength(header[j]!))
  );
  const top = style("2", BOX.tl + horiz(widths) + BOX.tr);
  const sep = style("2", BOX.lj + horiz(widths).replaceAll(BOX.tj, BOX.mj) + BOX.rj);
  const bot = style("2", BOX.bl + horiz(widths).replaceAll(BOX.tj, BOX.bj) + BOX.br);
  const colorizeDatum = (row: PairedDeltaRow, j: number, raw: string): string => {
    if (spec.expectation === ">0" && (j === 3 || j === 5)) {
      if (Number.isNaN(row.p50DeltaSdkNs)) return style("37", raw);
      return style(row.p50DeltaSdkNs > 0 ? "32" : "31", raw);
    }
    if (spec.expectation === ">0" && j === 6) {
      const z = row.signZ;
      if (Number.isNaN(z)) return style("37", raw);
      if (z >= INVARIANT_SIGN_Z_MIN) return style("32", raw);
      if (z >= 1.28) return style("33", raw);
      return style("31", raw);
    }
    if (spec.expectation === "≈0" && j === 6) {
      const absZ = Math.abs(row.signZ);
      if (Number.isNaN(absZ)) return style("37", raw);
      return style(absZ <= 2 ? "32" : absZ <= 3 ? "33" : "31", raw);
    }
    return style("37", raw);
  };
  const fmtRow = (row: string[], isHeader: boolean, r?: PairedDeltaRow) => {
    const pieces = row.map((cell, j) => {
      const w = widths[j]!;
      const painted = isHeader
        ? style("1;36", cell)
        : r
          ? colorizeDatum(r, j, cell)
          : style("37", cell);
      return padVisible(painted, w);
    });
    return style("2", BOX.v) + " " + pieces.join(" " + style("2", BOX.v) + " ") + " " + style("2", BOX.v);
  };
  console.error("");
  console.error(style("1;37", "═══════════════════════════════════════════════════════════════════"));
  console.error("  " + style("1;36", spec.title) + " " + style("36", spec.subtitle));
  console.error(top);
  console.error(fmtRow(header, true));
  console.error(sep);
  data.forEach((row, i) => console.error(fmtRow(row, false, rows[i]!)));
  console.error(bot);
  console.error(
    "  " +
      style(
        "2",
        spec.expectation === ">0"
          ? `Pass: p50 > 0 AND Δ>0 > 0.5 AND sign z ≥ ${INVARIANT_SIGN_Z_MIN} per op (per run). Any red p50 = environment noise beat the signal; raise warmup/measure or enable MICRO_BENCH_GC; see paired-local:tuned.`
          : "Pass: |sign z| ≲ 2 per op (no meaningful slot bias). Red = slot/GC asymmetry — try `--paired-order=alternate`, `MICRO_BENCH_GC=1`, longer warmup."
      )
  );
  console.error("");
}

const PAIRED_SDK_SPEC: PairedDeltaTableSpec = {
  symbol: "Δsdk",
  title: "Δsdk (paired)",
  subtitle: `mapper send − raw send (${"${u}"}; same client path, expected ≈ 0)`,
  expectation: "≈0",
};
const PAIRED_LIB_SPEC: PairedDeltaTableSpec = {
  symbol: "Δlib",
  title: "Δlib (paired)",
  subtitle: `mapper lib − raw lib (${"${u}"}; lib = total − send; mapper schema work, expected > 0)`,
  expectation: ">0",
};
const PAIRED_TOTAL_SPEC: PairedDeltaTableSpec = {
  symbol: "Δtotal",
  title: "Δtotal (paired)",
  subtitle: `mapper total − raw total (${"${u}"}; invariant: mapper ≥ raw, expected > 0)`,
  expectation: ">0",
};
const PAIRED_WALL_SPEC: PairedDeltaTableSpec = {
  symbol: "Δwall",
  title: "Δwall (paired, Local)",
  subtitle: `mapper total await − raw total await (${"${u}"}; expected > 0 on Local)`,
  expectation: ">0",
};

/** Interpolates `${u}` placeholder at print time so the unit label follows `--ms`. */
function hydrateSpec(spec: PairedDeltaTableSpec): PairedDeltaTableSpec {
  return { ...spec, subtitle: spec.subtitle.replace("${u}", benchUnitLabel()) };
}

function printPairedDeltaTable(rows: readonly PairedDeltaRow[]): void {
  printPairedDeltaTableWithSpec(rows, hydrateSpec(PAIRED_SDK_SPEC));
}

function printPairedWallDeltaTable(rows: readonly PairedDeltaRow[]): void {
  printPairedDeltaTableWithSpec(rows, hydrateSpec(PAIRED_WALL_SPEC));
}

function formatPairedWallDeltaMarkdown(rows: readonly PairedDeltaRow[]): string {
  return formatPairedDeltaMarkdownWithSpec(rows, hydrateSpec(PAIRED_WALL_SPEC));
}

/**
 * K-run aggregate for one op × one Δ metric. `p50Values` / `fracPositiveValues` contain **one entry
 * per run**; `runsPassing` reflects the invariant test appropriate for `expectation`.
 */
type KRunOpAggregate = {
  op: string;
  runs: number;
  p50Values: number[];
  fracPositiveValues: number[];
  signZValues: number[];
  /** Strict: p50 \> 0, frac(Δ\>0) \> 0.5, sign z ≥ `INVARIANT_SIGN_Z_MIN`. */
  runsPassing: number;
  /** Soft (Local-friendly): p50 \> 0 and majority Δ \> 0 — no sign-z gate. */
  runsPassingSoft: number;
};

function summarizeKRunForOp(
  op: string,
  deltaRowsPerRun: readonly PairedDeltaRow[],
  expectation: "≈0" | ">0"
): KRunOpAggregate {
  const p50Values = deltaRowsPerRun.map((r) => r.p50DeltaSdkNs);
  const fracPositiveValues = deltaRowsPerRun.map((r) => r.fracPositive);
  const signZValues = deltaRowsPerRun.map((r) => r.signZ);
  let runsPassing = 0;
  let runsPassingSoft = 0;
  for (const r of deltaRowsPerRun) {
    if (expectation === ">0") {
      const soft =
        !Number.isNaN(r.p50DeltaSdkNs) && r.p50DeltaSdkNs > 0 && r.fracPositive > 0.5;
      if (soft) runsPassingSoft++;
      if (soft && !Number.isNaN(r.signZ) && r.signZ >= INVARIANT_SIGN_Z_MIN) runsPassing++;
    } else {
      if (!Number.isNaN(r.signZ) && Math.abs(r.signZ) <= 2) {
        runsPassing++;
        runsPassingSoft++;
      }
    }
  }
  return {
    op,
    runs: deltaRowsPerRun.length,
    p50Values,
    fracPositiveValues,
    signZValues,
    runsPassing,
    runsPassingSoft,
  };
}

function minMedianMax(xs: readonly number[]): { min: number; med: number; max: number } {
  const clean = xs.filter((x) => !Number.isNaN(x)).slice().sort((a, b) => a - b);
  if (clean.length === 0) return { min: NaN, med: NaN, max: NaN };
  return {
    min: clean[0]!,
    med: percentileSortedAsc(clean, 0.5),
    max: clean[clean.length - 1]!,
  };
}

function formatKRunRange(mmm: { min: number; med: number; max: number }, kind: "ns" | "frac" | "signZ"): string {
  if (Number.isNaN(mmm.min)) return "n/a";
  const fmt =
    kind === "ns" ? fmtNs : kind === "frac" ? fmtFrac : fmtSignedNumber;
  return `${fmt(mmm.min)} | ${fmt(mmm.med)} | ${fmt(mmm.max)}`;
}

function printKRunInvariantSummary(
  title: string,
  aggregates: readonly KRunOpAggregate[],
  spec: PairedDeltaTableSpec
): void {
  if (aggregates.length === 0 || aggregates[0]!.runs < 2) return;
  const u = benchUnitLabel();
  const runs = aggregates[0]!.runs;
  const header = [
    "op",
    "runs",
    `p50 ${spec.symbol} min | med | max (${u})`,
    "Δ>0 min | med | max",
    "sign z min | med | max",
    "pass strict",
    "pass soft",
  ];
  const data = aggregates.map((a) => [
    a.op,
    String(a.runs),
    formatKRunRange(minMedianMax(a.p50Values), "ns"),
    formatKRunRange(minMedianMax(a.fracPositiveValues), "frac"),
    formatKRunRange(minMedianMax(a.signZValues), "signZ"),
    `${a.runsPassing}/${a.runs} (${fmtFrac(a.runsPassing / a.runs)})`,
    `${a.runsPassingSoft}/${a.runs} (${fmtFrac(a.runsPassingSoft / a.runs)})`,
  ]);
  const cells: string[][] = [header, ...data];
  const widths = header.map((_, j) =>
    Math.max(...cells.map((row) => visibleLength(row[j]!)), visibleLength(header[j]!))
  );
  const top = style("2", BOX.tl + horiz(widths) + BOX.tr);
  const sep = style("2", BOX.lj + horiz(widths).replaceAll(BOX.tj, BOX.mj) + BOX.rj);
  const bot = style("2", BOX.bl + horiz(widths).replaceAll(BOX.tj, BOX.bj) + BOX.br);
  const fmtRow = (row: string[], isHeader: boolean, aggIdx?: number) => {
    const pieces = row.map((cell, j) => {
      const w = widths[j]!;
      let painted: string;
      if (isHeader) painted = style("1;36", cell);
      else if (j === 5 && aggIdx !== undefined) {
        const agg = aggregates[aggIdx]!;
        const pass = agg.runsPassing === agg.runs;
        const some = agg.runsPassing > 0;
        painted = style(pass ? "32" : some ? "33" : "31", cell);
      } else if (j === 6 && aggIdx !== undefined) {
        const agg = aggregates[aggIdx]!;
        const pass = agg.runsPassingSoft === agg.runs;
        const some = agg.runsPassingSoft > 0;
        painted = style(pass ? "32" : some ? "33" : "31", cell);
      } else {
        painted = style("37", cell);
      }
      return padVisible(painted, w);
    });
    return style("2", BOX.v) + " " + pieces.join(" " + style("2", BOX.v) + " ") + " " + style("2", BOX.v);
  };
  console.error("");
  console.error(style("1;37", "═══════════════════════════════════════════════════════════════════"));
  console.error(
    "  " +
      style("1;36", title) +
      " " +
      style(
        "36",
        `K=${runs} runs per op — strict = ${spec.expectation === ">0" ? `p50>0 ∧ Δ>0 maj ∧ z≥${INVARIANT_SIGN_Z_MIN}` : "|z|≤2"}; soft (Local) = ${spec.expectation === ">0" ? "p50>0 ∧ Δ>0 maj" : "same"}`
      )
  );
  console.error(top);
  console.error(fmtRow(header, true));
  console.error(sep);
  data.forEach((row, i) => console.error(fmtRow(row, false, i)));
  console.error(bot);
  const passAll = aggregates.every((a) => a.runsPassing === a.runs);
  const passAllSoft = aggregates.every((a) => a.runsPassingSoft === a.runs);
  const passAny = aggregates.some((a) => a.runsPassing > 0);
  const passAnySoft = aggregates.some((a) => a.runsPassingSoft > 0);
  console.error(
    "  " +
      style(
        passAll ? "1;32" : passAllSoft ? "1;32" : passAny || passAnySoft ? "1;33" : "1;31",
        passAll
          ? "PASS (strict): every op every run — p50, majority Δ, and sign z."
          : passAllSoft
            ? "PASS (soft): every op every run — p50 > 0 and majority Δ > 0 (sign z can still jitter on Local)."
            : passAny || passAnySoft
              ? "PARTIAL: see pass strict / pass soft columns — raise warmup/measure, MICRO_BENCH_GC + node --expose-gc, or paired-local:tuned."
              : "FAIL: neither strict nor soft on all ops — tune knobs above."
      )
  );
  console.error("");
}

function formatKRunInvariantMarkdown(
  title: string,
  aggregates: readonly KRunOpAggregate[],
  spec: PairedDeltaTableSpec
): string {
  if (aggregates.length === 0 || aggregates[0]!.runs < 2) return "";
  const u = benchUnitLabel();
  const runs = aggregates[0]!.runs;
  const lines: string[] = [];
  lines.push(`## ${title} (K=${runs})`);
  lines.push("");
  lines.push(
    `Invariant: ${spec.expectation === ">0" ? `**strict:** p50 > 0 AND Δ>0 majority AND sign z ≥ ${INVARIANT_SIGN_Z_MIN}. **soft (Local):** p50 > 0 AND Δ>0 majority (no z).` : "**|sign z| ≤ 2** per run."}`
  );
  lines.push("");
  lines.push(
    `| op | runs | p50 ${spec.symbol} min \\| med \\| max (${u}) | Δ>0 min \\| med \\| max | sign z min \\| med \\| max | pass strict | pass soft |`
  );
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const a of aggregates) {
    lines.push(
      `| ${a.op} | ${a.runs} | ${formatKRunRange(minMedianMax(a.p50Values), "ns")} | ${formatKRunRange(minMedianMax(a.fracPositiveValues), "frac")} | ${formatKRunRange(minMedianMax(a.signZValues), "signZ")} | ${a.runsPassing}/${a.runs} | ${a.runsPassingSoft}/${a.runs} |`
    );
  }
  lines.push("");
  return lines.join("\n");
}

type PairedLocalOpRow = { op: string; raw: LatencySummary; mapper: LatencySummary; nPairs: number };

function printPairedWithLocalLatencyTable(rows: readonly PairedLocalOpRow[]): void {
  const u = benchUnitLabel();
  const header = ["op", "pairs", `v3 p50 (${u})`, `v3 mean (${u})`, `mapper p50 (${u})`, `mapper mean (${u})`];
  const data = rows.map((r) => [
    r.op,
    String(r.nPairs),
    fmtNs(r.raw.p50Ns),
    fmtNs(r.raw.meanNs),
    fmtNs(r.mapper.p50Ns),
    fmtNs(r.mapper.meanNs),
  ]);
  const cells: string[][] = [header, ...data];
  const widths = header.map((_, j) =>
    Math.max(...cells.map((row) => visibleLength(row[j]!)), visibleLength(header[j]!))
  );
  const top = style("2", BOX.tl + horiz(widths) + BOX.tr);
  const sep = style("2", BOX.lj + horiz(widths).replaceAll(BOX.tj, BOX.mj) + BOX.rj);
  const bot = style("2", BOX.bl + horiz(widths).replaceAll(BOX.tj, BOX.bj) + BOX.br);
  const fmtRow = (row: string[], isHeader: boolean) => {
    const pieces = row.map((cell, j) => {
      const w = widths[j]!;
      return padVisible(isHeader ? style("1;36", cell) : style("37", cell), w);
    });
    return style("2", BOX.v) + " " + pieces.join(" " + style("2", BOX.v) + " ") + " " + style("2", BOX.v);
  };
  console.error("");
  console.error(style("1;37", "═══════════════════════════════════════════════════════════════════"));
  console.error(
    "  " +
      style("1;36", "Paired with-local") +
      " " +
      style("36", `v3 doc vs mapper v3 — same measure window per op (DynamoDB Local; ${benchUnitLabel()})`)
  );
  console.error(
    "  " +
      style(
        "2",
        "Use this table to compare **v3 doc** vs **mapper v3**; the main matrix compares **separate** windows so Local/JVM noise can invert p50 there."
      )
  );
  console.error(top);
  console.error(fmtRow(header, true));
  console.error(sep);
  data.forEach((row) => console.error(fmtRow(row, false)));
  console.error(bot);
  console.error("");
}

function printLatencySummaryTable(
  results: Map<string, LatencySummary>,
  measureOnly: boolean,
  coldClient: boolean
): void {
  const names = [...results.keys()];
  if (names.length === 0) return;

  const u = benchUnitLabel();
  const keys = [
    "Task name",
    `p50 (${u})`,
    `p90 (${u})`,
    `median(batch p90) (${u})`,
    `mean (${u})`,
    "samples",
    "batches",
  ];
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
      coldClient
        ? `  Per-task results (cold path: no matrix prime, no per-task warmup; ${MEASURE_MS}ms measure; batch-p90 chunks of ${BATCH_SIZE})`
        : `  Per-task results (sequential ${WARMUP_MS}ms warmup, ${MEASURE_MS}ms measure; batch-p90 chunks of ${BATCH_SIZE})`
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
    style("96;1", "toolbox") +
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
  ansiTitle: string,
  /** Cold path: doc-cluster cells are **not** column-heated so mapper vs v3 ordering does not read as “faster/slower” from color alone. */
  coldClient?: boolean
): void {
  /** In `--measure-only`, v2 `DocumentClient` is omitted (no supported no-op wire path without a fake client). */
  const stacks = (
    measureOnly
      ? ["v3 doc", "mapper v3", "toolbox", "electrodb", "dynamoose"]
      : ["v2 doc", "v3 doc", "mapper v3", "toolbox", "electrodb", "dynamoose"]
  ) as readonly string[];
  const ops = ["put", "get", "update", "query", "delete"] as const;

  /** Stacks where per-column heat is misleading in `--cold-client` (setup dominates; mapper vs raw can invert). */
  const coldNoHeatStacks = new Set(
    measureOnly ? ["v3 doc", "mapper v3", "toolbox"] : ["v2 doc", "v3 doc", "mapper v3", "toolbox"]
  );
  const coldHeatStacks = ["electrodb", "dynamoose"] as const;

  const header = ["Stack", ...ops];
  const dataRows = stacks.map((s) => [
    s,
    ...ops.map((op) => {
      const v = nsByName.get(`${s}: ${op}`);
      return v !== undefined ? fmtNs(v) : "n/a";
    }),
  ]);

  const numericCols = ops.map((_, colIdx) => {
    const col = stacks.map((s) => nsByName.get(`${s}: ${ops[colIdx]!}`)).filter((n): n is number => n !== undefined);
    if (col.length === 0) return { min: 0, max: 0 };
    return { min: Math.min(...col), max: Math.max(...col) };
  });

  /** Per column: min/max among **electrodb** and **dynamoose** only (cold path heat tier). */
  const electroDynCols = ops.map((_, colIdx) => {
    const col = coldHeatStacks.map((s) => nsByName.get(`${s}: ${ops[colIdx]!}`)).filter((n): n is number => n !== undefined);
    if (col.length === 0) return { min: 0, max: 0 };
    return { min: Math.min(...col), max: Math.max(...col) };
  });

  const rawRows = [header, ...dataRows];
  const displayRows: string[][] = rawRows.map((row, ri) =>
    row.map((cell, ci) => {
      if (ri === 0) return style("1;36", cell);
      if (ci === 0) return colorizeTaskLabel(cell);
      const opIdx = ci - 1;
      const stack = stacks[ri - 1]!;
      const key = `${stack}: ${ops[opIdx]!}`;
      const ns = nsByName.get(key);
      if (ns === undefined) return style("2", cell);
      const formatted = fmtNs(ns);
      if (coldClient && coldNoHeatStacks.has(stack)) {
        return style("37", formatted);
      }
      if (coldClient) {
        const { min, max } = electroDynCols[opIdx]!;
        return heatLatencyNs(ns, min, max, formatted);
      }
      const { min, max } = numericCols[opIdx]!;
      return heatLatencyNs(ns, min, max, formatted);
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

  console.log(
    style(
      "1;35",
      ansiTitle +
        (coldClient
          ? ` — cold path: **no** column heat for v3/mapper/toolbox${measureOnly ? "" : " (+ v2)"}; green/red only **electrodb** vs **dynamoose** (${benchUnitLabel()})`
          : ` — heatmap per column (green = fastest, red = slowest; values in ${benchUnitLabel()})`)
    )
  );
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
      return v !== undefined ? fmtNs(v) : "n/a";
    });
    console.log(style("2", `| ${s} | ${cells.join(" | ")} |`));
  }
  console.log("");
}

function printFormattedBenchOutput(
  results: Map<string, LatencySummary>,
  mode: "measure-only" | "with-local" | "with-aws",
  coldClient: boolean
): void {
  const modeLabel =
    mode === "measure-only"
      ? style(
          "33",
          coldClient
            ? "measure-only · cold path (new client + one op per sample)"
            : "measure-only (no I/O, sequential per-call)"
        )
      : mode === "with-aws"
        ? style(
            "36",
            coldClient
              ? "AWS DynamoDB · cold path (new client + one op per sample)"
              : "AWS DynamoDB (sequential per-call)"
          )
        : style(
            "36",
            coldClient
              ? "DynamoDB Local · cold path (new client + one op per sample)"
              : "DynamoDB Local (sequential per-call)"
          );
  console.log(style("1;37", "\n═══════════════════════════════════════════════════════════════════"));
  console.log(
    style("1;37", "  DynamoDB stack comparison — ") + modeLabel + style("1;37", " (same keys as micro-bench.ts)")
  );
  console.log(style("1;37", "═══════════════════════════════════════════════════════════════════\n"));

  if (coldClient) {
    console.log(
      style(
        "2",
        "  Cold path: timings include **`DynamoDBClient` / fake `DynamoDB` + `DynamoDBDocumentClient.from`** and per-sample **Toolbox / Electro / mapper** handle build where applicable; **Dynamoose** uses a fresh service client each sample. Not comparable to the default **hot-path** matrix without the same flag."
      )
    );
    console.log("");
  }

  if (displayTimeMs) {
    console.log(
      style("2", `  Display: latencies shown in **milliseconds** (${benchUnitLabel()}); timers still use nanoseconds internally.`)
    );
    console.log("");
  }
  printLatencySummaryTable(results, mode === "measure-only", coldClient);
  const p50Map = buildNsByOpMap(results, "p50Ns");
  const p90Map = buildNsByOpMap(results, "p90Ns");
  const medianBatchP90Map = buildNsByOpMap(results, "medianBatchP90Ns");
  const u = benchUnitLabel();
  printLatencyMatrixNs(
    p50Map,
    mode === "measure-only",
    `p50 (median) latency (${u})`,
    `  p50 (median) latency (${u})`,
    coldClient
  );
  printLatencyMatrixNs(p90Map, mode === "measure-only", `p90 latency (${u})`, `  p90 latency (${u})`, coldClient);
  printLatencyMatrixNs(
    medianBatchP90Map,
    mode === "measure-only",
    `median of per-batch p90 (${u})`,
    `  median(batch p90) (${u})`,
    coldClient
  );
  if (mode === "measure-only") {
    console.log(
      style(
        "2",
        "  Note: v2 DocumentClient tasks are omitted in measure-only (no supported no-network path without a non-representative fake client)."
      )
    );
    console.log(
      style(
        "2",
        coldClient
          ? "  Interpretation (cold path): matrix compares **construct client + build stack handles + one op** per sample. Do **not** apply the hot-path rule **mapper p50 ≥ v3 doc** here — overhead is dominated by client/setup, and small inversions are normal. For mapper-vs-raw layer cost, run **without** `--cold-client` (optionally **paired** modes)."
          : "  Interpretation: **v3 doc** is the direct client call; **mapper v3** adds schema work — **higher ns = slower**; expect **mapper v3 p50 ≥ v3 doc p50** per op. If not, see stderr for [bench] invariant warnings."
      )
    );
    console.log("");
  } else {
    console.log(
      style(
        "2",
        coldClient
          ? "  Interpretation (cold path on Local): same as measure-only cold — matrix is **bootstrap + one op** per sample, not steady-state mapper-vs-raw. For comparable v3 vs mapper on Local, run **without** `--cold-client` and use **paired-with-local** if needed."
          : "  Interpretation: **mapper v3 p50 ≥ v3 doc p50** per op (higher ns = slower; same idea as measure-only). See [bench] warnings on stderr if violated."
      )
    );
    if (!coldClient) {
      console.log(
        style(
          "2",
          "  **query** (often **get** too): each stack row is its **own** warmup+measure window on Local, so RTT/JVM jitter between rows can flip **p50** even though both paths end in the same `QueryCommand` / unmarshalling shape. Do **not** read a single inverted cell as “mapper is faster”; use **Paired with-local** (stderr) for a same-window v3 doc vs mapper v3 read."
        )
      );
    }
    console.log("");
  }
}

function buildToolboxTableAndEntity(docClient: DynamoDBDocumentClient) {
  const table = new Table({
    name: TABLE,
    partitionKey: { name: "pk", type: "string" },
    sortKey: { name: "sk", type: "string" },
    documentClient: docClient,
  });
  const entity = new Entity({
    name: "BenchUserToolbox",
    table,
    schema: toolboxItemSchema({
      pk: string().key(),
      sk: string().key(),
      userId: string(),
      profileKey: string(),
      name: string(),
      email: string(),
      body: string(),
      version: number(),
    }),
    timestamps: false,
    entityAttribute: false,
  });
  return { toolboxTable: table, toolboxEntity: entity };
}

function buildElectroEntity(docClient: DynamoDBDocumentClient) {
  return new ElectroEntity(
    {
      model: { entity: "benchuser", version: "1", service: "cmpbench" },
      attributes: {
        userId: { type: "string", required: true },
        profileKey: { type: "string", required: true },
        name: { type: "string" },
        email: { type: "string" },
        body: { type: "string" },
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
    body: { type: String },
    version: { type: Number },
  });
  return dynamoose.model("BenchUser", schema, {
    tableName: TABLE,
    create: false,
    waitForActive: false,
  });
}

type CompareTaskDef = { name: string; run: () => Promise<unknown> };

function buildCompareTaskDefs(p: {
  cold: boolean;
  measureOnly: boolean;
  /** Where cold-path / v2 stacks send traffic (`aws` ⇒ regional endpoint + default credentials). */
  trafficMode: "measure-only" | "local" | "aws";
  breakdownMeter: BreakdownMeter | null;
  docClient: DynamoDBDocumentClient;
  docV2: AWS.DynamoDB.DocumentClient | undefined;
  UserTable: ReturnType<typeof userTableHandle>;
  toolboxTable: ReturnType<typeof buildToolboxTableAndEntity>["toolboxTable"];
  toolboxEntity: ReturnType<typeof buildToolboxTableAndEntity>["toolboxEntity"];
  ElectroUser: ReturnType<typeof buildElectroEntity>;
  DynUser: ReturnType<typeof buildDynamooseModel>;
}): CompareTaskDef[] {
  const {
    cold,
    measureOnly,
    trafficMode,
    breakdownMeter: m,
    docClient,
    docV2,
    UserTable,
    toolboxTable,
    toolboxEntity,
    ElectroUser,
    DynUser,
  } = p;

  const v2Opts =
    trafficMode === "aws"
      ? { region: resolveBenchAwsRegion() }
      : {
          region: process.env.AWS_REGION ?? "us-east-1",
          endpoint: process.env.DYNAMODB_ENDPOINT ?? "http://localhost:8000",
          credentials: new AWS.Credentials(
            process.env.AWS_ACCESS_KEY_ID ?? "local",
            process.env.AWS_SECRET_ACCESS_KEY ?? "local"
          ),
        };

  const wrapColdDoc = (fn: (dc: DynamoDBDocumentClient) => Promise<unknown>): (() => Promise<unknown>) => {
    return () => {
      if (measureOnly) return runWithFreshMeasureDocStack(m, fn);
      if (trafficMode === "aws") return runWithFreshAwsDocStack(fn);
      return runWithFreshLocalDocStack(fn);
    };
  };

  const wrapColdDyn = (fn: () => Promise<unknown>): (() => Promise<unknown>) => {
    return () => {
      if (measureOnly) return runWithFreshMeasureDynamooseStack(m, fn);
      if (trafficMode === "aws") return runWithFreshAwsDynamooseStack(fn);
      return runWithFreshLocalDynamooseStack(fn);
    };
  };

  const wrapV2 = (hot: () => Promise<unknown>, coldRun: () => Promise<unknown>): (() => Promise<unknown>) => {
    return cold ? coldRun : hot;
  };

  const out: CompareTaskDef[] = [];

  if (!measureOnly) {
    out.push({
      name: "v2 doc: put",
      run: wrapV2(
        () => docV2!.put({ TableName: TABLE, Item: { ...item } }).promise(),
        () => new AWS.DynamoDB.DocumentClient(v2Opts).put({ TableName: TABLE, Item: { ...item } }).promise()
      ),
    });
  }

  out.push(
    {
      name: "v3 doc: put",
      run: cold
        ? wrapColdDoc((dc) =>
            dc.send(
              new PutCommand({
                TableName: TABLE,
                Item: { ...item },
              })
            )
          )
        : () =>
            docClient.send(
              new PutCommand({
                TableName: TABLE,
                Item: { ...item },
              })
            ),
    },
    {
      name: "mapper v3: put",
      run: cold
        ? wrapColdDoc((dc) => userTableHandle(dc).put({ ...row }))
        : () => UserTable.put({ ...row }),
    },
    {
      name: "toolbox: put",
      run: cold
        ? wrapColdDoc((dc) => {
            const { toolboxEntity: te } = buildToolboxTableAndEntity(dc);
            return te
              .build(PutItemCommand)
              .item({
                pk,
                sk,
                userId: row.userId,
                profileKey: row.profileKey,
                name: row.name,
                email: row.email,
                body: row.body,
                version: row.version,
              })
              .send();
          })
        : () =>
            toolboxEntity
              .build(PutItemCommand)
              .item({
                pk,
                sk,
                userId: row.userId,
                profileKey: row.profileKey,
                name: row.name,
                email: row.email,
                body: row.body,
                version: row.version,
              })
              .send(),
    },
    {
      name: "electrodb: put",
      run: cold ? wrapColdDoc((dc) => buildElectroEntity(dc).put({ ...row }).go()) : () => ElectroUser.put({ ...row }).go(),
    },
    {
      name: "dynamoose: put",
      run: cold
        ? wrapColdDyn(() =>
            DynUser.create(
              {
                pk,
                sk,
                userId: row.userId,
                profileKey: row.profileKey,
                name: row.name,
                email: row.email,
                body: row.body,
                version: row.version,
              },
              { overwrite: true }
            )
          )
        : () =>
            DynUser.create(
              {
                pk,
                sk,
                userId: row.userId,
                profileKey: row.profileKey,
                name: row.name,
                email: row.email,
                body: row.body,
                version: row.version,
              },
              { overwrite: true }
            ),
    }
  );

  if (!measureOnly) {
    out.push({
      name: "v2 doc: get",
      run: wrapV2(
        () => docV2!.get({ TableName: TABLE, Key: { pk, sk } }).promise(),
        () => new AWS.DynamoDB.DocumentClient(v2Opts).get({ TableName: TABLE, Key: { pk, sk } }).promise()
      ),
    });
  }

  out.push(
    {
      name: "v3 doc: get",
      run: cold
        ? wrapColdDoc((dc) =>
            dc.send(
              new GetCommand({
                TableName: TABLE,
                Key: { pk, sk },
              })
            )
          )
        : () =>
            docClient.send(
              new GetCommand({
                TableName: TABLE,
                Key: { pk, sk },
              })
            ),
    },
    {
      name: "mapper v3: get",
      run: cold ? wrapColdDoc((dc) => userTableHandle(dc).get({ ...key })) : () => UserTable.get({ ...key }),
    },
    {
      name: "toolbox: get",
      run: cold
        ? wrapColdDoc((dc) => {
            const { toolboxEntity: te } = buildToolboxTableAndEntity(dc);
            return te.build(GetItemCommand).key({ pk, sk }).send();
          })
        : () => toolboxEntity.build(GetItemCommand).key({ pk, sk }).send(),
    },
    {
      name: "electrodb: get",
      run: cold
        ? wrapColdDoc((dc) => buildElectroEntity(dc).get({ userId: row.userId, profileKey: row.profileKey }).go())
        : () => ElectroUser.get({ userId: row.userId, profileKey: row.profileKey }).go(),
    },
    { name: "dynamoose: get", run: cold ? wrapColdDyn(() => DynUser.get({ pk, sk })) : () => DynUser.get({ pk, sk }) }
  );

  if (!measureOnly) {
    out.push({
      name: "v2 doc: update",
      run: wrapV2(
        () =>
          docV2!
            .update({
              TableName: TABLE,
              Key: { pk, sk },
              UpdateExpression: "SET #n0 = :v0, #n1 = :v1",
              ExpressionAttributeNames: { "#n0": "name", "#n1": "version" },
              ExpressionAttributeValues: { ":v0": "Bob", ":v1": 2 },
            })
            .promise(),
        () =>
          new AWS.DynamoDB.DocumentClient(v2Opts)
            .update({
              TableName: TABLE,
              Key: { pk, sk },
              UpdateExpression: "SET #n0 = :v0, #n1 = :v1",
              ExpressionAttributeNames: { "#n0": "name", "#n1": "version" },
              ExpressionAttributeValues: { ":v0": "Bob", ":v1": 2 },
            })
            .promise()
      ),
    });
  }

  out.push(
    {
      name: "v3 doc: update",
      run: cold
        ? wrapColdDoc((dc) =>
            dc.send(
              new UpdateCommand({
                TableName: TABLE,
                Key: { pk, sk },
                UpdateExpression: "SET #n0 = :v0, #n1 = :v1",
                ExpressionAttributeNames: { "#n0": "name", "#n1": "version" },
                ExpressionAttributeValues: { ":v0": "Bob", ":v1": 2 },
              })
            )
          )
        : () =>
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
      run: cold
        ? wrapColdDoc((dc) => userTableHandle(dc).update({ ...key }, { set: { name: "Bob", version: 2 } }))
        : () => UserTable.update({ ...key }, { set: { name: "Bob", version: 2 } }),
    },
    {
      name: "toolbox: update",
      run: cold
        ? wrapColdDoc((dc) => {
            const { toolboxEntity: te } = buildToolboxTableAndEntity(dc);
            return te.build(UpdateItemCommand).item({ pk, sk, name: "Bob", version: 2 }).send();
          })
        : () => toolboxEntity.build(UpdateItemCommand).item({ pk, sk, name: "Bob", version: 2 }).send(),
    },
    {
      name: "electrodb: update",
      run: cold
        ? wrapColdDoc((dc) =>
            buildElectroEntity(dc)
              .patch({ userId: row.userId, profileKey: row.profileKey })
              .set({ name: "Bob", version: 2 })
              .go()
          )
        : () =>
            ElectroUser.patch({ userId: row.userId, profileKey: row.profileKey }).set({ name: "Bob", version: 2 }).go(),
    },
    {
      name: "dynamoose: update",
      run: cold
        ? wrapColdDyn(() => DynUser.update({ pk, sk }, { name: "Bob", version: 2 }))
        : () => DynUser.update({ pk, sk }, { name: "Bob", version: 2 }),
    }
  );

  if (!measureOnly) {
    out.push({
      name: "v2 doc: query",
      run: wrapV2(
        () =>
          docV2!
            .query({
              TableName: TABLE,
              KeyConditionExpression: "#pk = :pk",
              ExpressionAttributeNames: { "#pk": "pk" },
              ExpressionAttributeValues: { ":pk": pk },
            })
            .promise(),
        () =>
          new AWS.DynamoDB.DocumentClient(v2Opts)
            .query({
              TableName: TABLE,
              KeyConditionExpression: "#pk = :pk",
              ExpressionAttributeNames: { "#pk": "pk" },
              ExpressionAttributeValues: { ":pk": pk },
            })
            .promise()
      ),
    });
  }

  out.push(
    {
      name: "v3 doc: query",
      run: cold
        ? wrapColdDoc((dc) =>
            dc.send(
              new QueryCommand({
                TableName: TABLE,
                KeyConditionExpression: "#pk = :pk",
                ExpressionAttributeNames: { "#pk": "pk" },
                ExpressionAttributeValues: { ":pk": pk },
              })
            )
          )
        : () =>
            docClient.send(
              new QueryCommand({
                TableName: TABLE,
                KeyConditionExpression: "#pk = :pk",
                ExpressionAttributeNames: { "#pk": "pk" },
                ExpressionAttributeValues: { ":pk": pk },
              })
            ),
    },
    {
      name: "mapper v3: query",
      run: cold ? wrapColdDoc((dc) => userTableHandle(dc).query({ userId: row.userId })) : () => UserTable.query({ userId: row.userId }),
    },
    {
      name: "toolbox: query",
      run: cold
        ? wrapColdDoc((dc) => {
            const { toolboxTable: tt, toolboxEntity: te } = buildToolboxTableAndEntity(dc);
            return tt.build(ToolboxQueryCommand).entities(te).query({ partition: pk }).send();
          })
        : () => toolboxTable.build(ToolboxQueryCommand).entities(toolboxEntity).query({ partition: pk }).send(),
    },
    {
      name: "electrodb: query",
      run: cold
        ? wrapColdDoc((dc) => buildElectroEntity(dc).query.byUser({ userId: row.userId }).go())
        : () => ElectroUser.query.byUser({ userId: row.userId }).go(),
    },
    {
      name: "dynamoose: query",
      run: cold ? wrapColdDyn(() => DynUser.query("pk").eq(pk).exec()) : () => DynUser.query("pk").eq(pk).exec(),
    }
  );

  if (!measureOnly) {
    out.push({
      name: "v2 doc: delete",
      run: wrapV2(
        () => docV2!.delete({ TableName: TABLE, Key: { pk, sk } }).promise(),
        () => new AWS.DynamoDB.DocumentClient(v2Opts).delete({ TableName: TABLE, Key: { pk, sk } }).promise()
      ),
    });
  }

  out.push(
    {
      name: "v3 doc: delete",
      run: cold
        ? wrapColdDoc((dc) =>
            dc.send(
              new DeleteCommand({
                TableName: TABLE,
                Key: { pk, sk },
              })
            )
          )
        : () =>
            docClient.send(
              new DeleteCommand({
                TableName: TABLE,
                Key: { pk, sk },
              })
            ),
    },
    {
      name: "mapper v3: delete",
      run: cold ? wrapColdDoc((dc) => userTableHandle(dc).delete({ ...key })) : () => UserTable.delete({ ...key }),
    },
    {
      name: "toolbox: delete",
      run: cold
        ? wrapColdDoc((dc) => {
            const { toolboxEntity: te } = buildToolboxTableAndEntity(dc);
            return te.build(DeleteItemCommand).key({ pk, sk }).send();
          })
        : () => toolboxEntity.build(DeleteItemCommand).key({ pk, sk }).send(),
    },
    {
      name: "electrodb: delete",
      run: cold
        ? wrapColdDoc((dc) =>
            buildElectroEntity(dc).delete({ userId: row.userId, profileKey: row.profileKey }).go()
          )
        : () => ElectroUser.delete({ userId: row.userId, profileKey: row.profileKey }).go(),
    },
    {
      name: "dynamoose: delete",
      run: cold ? wrapColdDyn(() => DynUser.delete({ pk, sk })) : () => DynUser.delete({ pk, sk }),
    }
  );

  return out;
}

async function main() {
  if (withLocal && measureOnly) {
    console.error("Use only one of --measure-only or --with-local.");
    process.exit(1);
  }
  if (withAws && measureOnly) {
    console.error("Use only one of --measure-only or --with-aws.");
    process.exit(1);
  }
  if (withLocal && withAws) {
    console.error("Use only one of --with-local or --with-aws (not both).");
    process.exit(1);
  }
  if (!withLocal && !measureOnly && !withAws) {
    console.error(
      "Pick exactly one mode:\n  yarn sample:bench:compare -- --measure-only\n  yarn sample:bench:compare -- --with-local\n  yarn sample:bench:compare -- --with-aws"
    );
    process.exit(1);
  }
  if (wantBreakdown && !measureOnly) {
    console.error("--breakdown (or MICRO_BENCH_BREAKDOWN=1) requires --measure-only.");
    process.exit(1);
  }
  if (wantPairedBreakdown && (!measureOnly || !wantBreakdown)) {
    console.error(
      "--paired-breakdown (or MICRO_BENCH_PAIRED=1) requires --measure-only and --breakdown."
    );
    process.exit(1);
  }
  if (wantPairedWithLocal && measureOnly) {
    console.error(
      "--paired-with-local (or MICRO_BENCH_PAIRED_LOCAL=1) cannot be used with --measure-only."
    );
    process.exit(1);
  }
  if (wantPairedWithLocal && wantPairedBreakdown) {
    console.error("Use only one of --paired-breakdown or --paired-with-local.");
    process.exit(1);
  }
  if (wantPairedWithAws && measureOnly) {
    console.error("--paired-with-aws cannot be used with --measure-only.");
    process.exit(1);
  }
  if (wantPairedWithAws && wantPairedWithLocal) {
    console.error("Use only one of --paired-with-local or --paired-with-aws.");
    process.exit(1);
  }
  if (wantPairedWithAws && wantPairedBreakdown) {
    console.error("Use only one of --paired-breakdown or --paired-with-aws.");
    process.exit(1);
  }
  if (wantColdClient && wantPairedBreakdown) {
    console.error("--cold-client cannot be combined with --paired-breakdown (paired mode needs a stable client).");
    process.exit(1);
  }
  if (wantColdClient && wantPairedWithLocal) {
    console.error("--cold-client cannot be combined with --paired-with-local.");
    process.exit(1);
  }
  if (wantColdClient && wantPairedWithAws) {
    console.error("--cold-client cannot be combined with --paired-with-aws.");
    process.exit(1);
  }

  const trafficMode = measureOnly ? "measure-only" : withAws ? "aws" : "local";
  const mode =
    trafficMode === "measure-only"
      ? "measure-only"
      : trafficMode === "aws"
        ? "with-aws"
        : "with-local";
  const breakdownMeter = measureOnly && wantBreakdown ? new BreakdownMeter() : null;

  let docClient: DynamoDBDocumentClient;
  let docV2: AWS.DynamoDB.DocumentClient | undefined;

  if (measureOnly) {
    const sharedMeasureOnlyDdb = buildMeasureOnlySharedDynamoDb(
      benchUserItemToAttributeMap(item),
      breakdownMeter
    );
    docClient = DynamoDBDocumentClient.from(sharedMeasureOnlyDdb);
    if (breakdownMeter) {
      patchSendForBreakdown(sharedMeasureOnlyDdb, breakdownMeter);
      patchSendForBreakdown(docClient, breakdownMeter);
    }
    dynamoose.aws.ddb.set(sharedMeasureOnlyDdb);
  } else if (withAws) {
    const { ddbClient, docClient: realDoc } = createAwsBenchClients();
    await ensureBenchTable(ddbClient, "aws");
    dynamoose.aws.ddb.set(createAwsBenchDynamoService());
    docClient = realDoc;
    docV2 = new AWS.DynamoDB.DocumentClient({
      region: resolveBenchAwsRegion(),
    });
  } else {
    const { ddbClient, docClient: realDoc } = createLocalClients();
    await ensureBenchTable(ddbClient, "local");
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
  const { toolboxTable, toolboxEntity } = buildToolboxTableAndEntity(docClient);
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

  const taskDefs = buildCompareTaskDefs({
    cold: wantColdClient,
    measureOnly,
    trafficMode,
    breakdownMeter,
    docClient,
    docV2,
    UserTable,
    toolboxTable,
    toolboxEntity,
    ElectroUser,
    DynUser,
  });

  const results = new Map<string, LatencySummary>();
  const breakdownSummaries: TaskBreakdownSummary[] = [];
  if (!wantColdClient) {
    await primeSharedV3DocBaseline(docClient, WARMUP_MS);
  } else {
    console.error(
      style("2", "  [bench] --cold-client: skipping matrix prime and per-task warmup; each sample = construct client + handles + one op.")
    );
    console.error("");
  }
  let ti = 0;
  for (const def of taskDefs) {
    ti++;
    process.stderr.write(
      `\r  Sampling ${ti}/${taskDefs.length}: ${def.name}${" ".repeat(Math.max(0, 64 - def.name.length))}`
    );
    if (!wantColdClient) {
      await warmupSequential(def.run, WARMUP_MS);
    }
    maybeGcAfterWarmup();
    if (breakdownMeter) {
      const { flatNs, batchesNs, breakdownSamples } = await collectSequentialSamplesNsWithBreakdown(
        def.run,
        MEASURE_MS,
        breakdownMeter
      );
      results.set(def.name, summarizeLatencySamples(flatNs, batchesNs));
      breakdownSummaries.push(summarizeBreakdownTask(def.name, breakdownSamples));
    } else {
      const { flatNs, batchesNs } = await collectSequentialSamplesNs(def.run, MEASURE_MS);
      results.set(def.name, summarizeLatencySamples(flatNs, batchesNs));
    }
  }
  process.stderr.write("\r" + " ".repeat(80) + "\r");

  printFormattedBenchOutput(results, mode, wantColdClient);
  if (wantBreakdown && breakdownSummaries.length > 0) {
    emitBreakdownOutput(breakdownSummaries, mode, breakdownOutFile);
  }

  if (wantPairedBreakdown && breakdownMeter) {
    const pairedOrder = parsePairedOrderFlag();
    /** `lastRun*Rows[opIdx]` is overwritten each run so the per-iteration table prints the final run. */
    let lastPairedSummaries: TaskBreakdownSummary[] = [];
    let lastSdkRows: PairedDeltaRow[] = [];
    let lastLibRows: PairedDeltaRow[] = [];
    let lastTotalRows: PairedDeltaRow[] = [];
    /** `sdkRowsByRun[runIdx][opIdx]`. */
    const sdkRowsByRun: PairedDeltaRow[][] = [];
    const libRowsByRun: PairedDeltaRow[][] = [];
    const totalRowsByRun: PairedDeltaRow[][] = [];

    for (let k = 0; k < REPEATS; k++) {
      const pairedSummaries: TaskBreakdownSummary[] = [];
      const sdkRows: PairedDeltaRow[] = [];
      const libRows: PairedDeltaRow[] = [];
      const totalRows: PairedDeltaRow[] = [];
      let opi = 0;
      for (const op of BENCH_OPS) {
        opi++;
        const rawDef = taskDefs.find((d) => d.name === `v3 doc: ${op}`);
        const mapDef = taskDefs.find((d) => d.name === `mapper v3: ${op}`);
        if (!rawDef || !mapDef) {
          throw new Error(`Internal: missing v3 doc / mapper v3 task for op "${op}"`);
        }
        const runLabel = REPEATS > 1 ? ` (run ${k + 1}/${REPEATS})` : "";
        process.stderr.write(`\r  Paired ${opi}/${BENCH_OPS.length}: ${op}${runLabel}${" ".repeat(24)}`);
        await warmupPaired(rawDef.run, mapDef.run, WARMUP_MS, pairedOrder);
        maybeGcAfterWarmup();
        const { rawSamples, mapperSamples, deltaSdkNs, deltaTotalNs, deltaLibNs } =
          await collectPairedBreakdownSamples(
            rawDef.run,
            mapDef.run,
            MEASURE_MS,
            breakdownMeter,
            pairedOrder
          );
        pairedSummaries.push(summarizeBreakdownTask(`v3 doc: ${op} (paired)`, rawSamples));
        pairedSummaries.push(summarizeBreakdownTask(`mapper v3: ${op} (paired)`, mapperSamples));
        sdkRows.push(summarizePairedDelta(op, deltaSdkNs));
        libRows.push(summarizePairedDelta(op, deltaLibNs));
        totalRows.push(summarizePairedDelta(op, deltaTotalNs));
      }
      sdkRowsByRun.push(sdkRows);
      libRowsByRun.push(libRows);
      totalRowsByRun.push(totalRows);
      lastPairedSummaries = pairedSummaries;
      lastSdkRows = sdkRows;
      lastLibRows = libRows;
      lastTotalRows = totalRows;
    }
    process.stderr.write("\r" + " ".repeat(80) + "\r");

    console.error(
      "  " +
        style("2", `Paired iteration order: ${pairedOrder} — if mean Δsdk flips vs raw-first, slot order biased the clock; use alternate to average it out.`)
    );
    if (REPEATS > 1) {
      console.error(
        "  " + style("2", `Repeats: K=${REPEATS} (per-op warmup+measure per run). Per-iteration tables below show the **last** run; the K-run invariant summary follows.`)
      );
    }
    console.error("");

    const pairedLabel = `${mode}, paired v3 vs mapper (same window, ${pairedOrder}${REPEATS > 1 ? `, last of ${REPEATS} runs` : ""})`;
    printBreakdownTableColored(lastPairedSummaries, pairedLabel);
    printPairedDeltaTable(lastSdkRows);
    printPairedDeltaTableWithSpec(lastLibRows, hydrateSpec(PAIRED_LIB_SPEC));
    printPairedDeltaTableWithSpec(lastTotalRows, hydrateSpec(PAIRED_TOTAL_SPEC));

    if (REPEATS > 1) {
      const sdkAgg = BENCH_OPS.map((op, i) =>
        summarizeKRunForOp(
          op,
          sdkRowsByRun.map((run) => run[i]!),
          "≈0"
        )
      );
      const libAgg = BENCH_OPS.map((op, i) =>
        summarizeKRunForOp(
          op,
          libRowsByRun.map((run) => run[i]!),
          ">0"
        )
      );
      const totalAgg = BENCH_OPS.map((op, i) =>
        summarizeKRunForOp(
          op,
          totalRowsByRun.map((run) => run[i]!),
          ">0"
        )
      );
      printKRunInvariantSummary("K-run summary: Δtotal (invariant)", totalAgg, hydrateSpec(PAIRED_TOTAL_SPEC));
      printKRunInvariantSummary("K-run summary: Δlib (invariant)", libAgg, hydrateSpec(PAIRED_LIB_SPEC));
      printKRunInvariantSummary("K-run summary: Δsdk (sanity)", sdkAgg, hydrateSpec(PAIRED_SDK_SPEC));
      if (breakdownOutFile) {
        const md =
          formatKRunInvariantMarkdown("K-run Δtotal (invariant)", totalAgg, hydrateSpec(PAIRED_TOTAL_SPEC)) +
          "\n" +
          formatKRunInvariantMarkdown("K-run Δlib (invariant)", libAgg, hydrateSpec(PAIRED_LIB_SPEC)) +
          "\n" +
          formatKRunInvariantMarkdown("K-run Δsdk (sanity)", sdkAgg, hydrateSpec(PAIRED_SDK_SPEC));
        appendFileSync(breakdownOutFile, "\n\n" + md, "utf8");
        console.error(style("32", `  [Appended K-run invariant summary to ${breakdownOutFile}]`));
        console.error("");
      }
    }

    if (breakdownOutFile) {
      const md =
        formatBreakdownMarkdown(lastPairedSummaries, pairedLabel) +
        formatPairedDeltaMarkdownWithSpec(lastSdkRows, hydrateSpec(PAIRED_SDK_SPEC)) +
        formatPairedDeltaMarkdownWithSpec(lastLibRows, hydrateSpec(PAIRED_LIB_SPEC)) +
        formatPairedDeltaMarkdownWithSpec(lastTotalRows, hydrateSpec(PAIRED_TOTAL_SPEC));
      appendFileSync(breakdownOutFile, "\n\n" + md, "utf8");
      console.error(style("32", `  [Appended paired breakdown + Δsdk/lib/total to ${breakdownOutFile}]`));
      console.error("");
    }
  }

  if ((wantPairedWithLocal && withLocal) || (wantPairedWithAws && withAws)) {
    const pairedWallKind: "Local" | "AWS" = wantPairedWithAws ? "AWS" : "Local";
    const pairedOrder = parsePairedOrderFlag();
    let lastWallDeltaRows: PairedDeltaRow[] = [];
    let lastLocalLatencyRows: PairedLocalOpRow[] = [];
    const wallRowsByRun: PairedDeltaRow[][] = [];

    for (let k = 0; k < REPEATS; k++) {
      const wallDeltaRows: PairedDeltaRow[] = [];
      const localLatencyRows: PairedLocalOpRow[] = [];
      let opi = 0;
      for (const op of BENCH_OPS) {
        opi++;
        const rawDef = taskDefs.find((d) => d.name === `v3 doc: ${op}`);
        const mapDef = taskDefs.find((d) => d.name === `mapper v3: ${op}`);
        if (!rawDef || !mapDef) {
          throw new Error(`Internal: missing v3 doc / mapper v3 task for op "${op}"`);
        }
        const runLabel = REPEATS > 1 ? ` (run ${k + 1}/${REPEATS})` : "";
        process.stderr.write(`\r  Paired ${pairedWallKind} ${opi}/${BENCH_OPS.length}: ${op}${runLabel}${" ".repeat(16)}`);
        await warmupPaired(rawDef.run, mapDef.run, WARMUP_MS, pairedOrder);
        maybeGcAfterWarmup();
        const { rawNs, mapperNs, deltaTotalNs } = await collectPairedWallSamplesNs(
          rawDef.run,
          mapDef.run,
          MEASURE_MS,
          pairedOrder
        );
        const rawSum = summarizeLatencySamples(rawNs, chunkSequential(rawNs, BATCH_SIZE));
        const mapSum = summarizeLatencySamples(mapperNs, chunkSequential(mapperNs, BATCH_SIZE));
        localLatencyRows.push({ op, raw: rawSum, mapper: mapSum, nPairs: rawNs.length });
        wallDeltaRows.push(summarizePairedDelta(op, deltaTotalNs));
      }
      wallRowsByRun.push(wallDeltaRows);
      lastWallDeltaRows = wallDeltaRows;
      lastLocalLatencyRows = localLatencyRows;
    }
    process.stderr.write("\r" + " ".repeat(80) + "\r");

    console.error(
      "  " +
        style(
          "2",
          `Paired ${pairedWallKind === "AWS" ? "with-aws" : "with-local"} iteration order: ${pairedOrder} — same idea as measure-only paired; use \`--paired-order=alternate\` to average slot bias.`
        )
    );
    if (REPEATS > 1) {
      console.error(
        "  " + style("2", `Repeats: K=${REPEATS}. Per-iteration tables below show the **last** run; the K-run invariant summary follows.`)
      );
    }
    console.error("");
    printPairedWithLocalLatencyTable(lastLocalLatencyRows);
    printPairedWallDeltaTable(lastWallDeltaRows);

    if (REPEATS > 1) {
      const wallAgg = BENCH_OPS.map((op, i) =>
        summarizeKRunForOp(
          op,
          wallRowsByRun.map((run) => run[i]!),
          ">0"
        )
      );
      printKRunInvariantSummary(
        `K-run summary: Δwall (invariant, ${pairedWallKind})`,
        wallAgg,
        hydrateSpec(PAIRED_WALL_SPEC)
      );
      if (breakdownOutFile) {
        appendFileSync(
          breakdownOutFile,
          "\n\n" +
            formatKRunInvariantMarkdown(`K-run Δwall (invariant, ${pairedWallKind})`, wallAgg, hydrateSpec(PAIRED_WALL_SPEC)),
          "utf8"
        );
        console.error(style("32", `  [Appended K-run Δwall summary to ${breakdownOutFile}]`));
        console.error("");
      }
    }

    if (breakdownOutFile) {
      const md =
        `## Paired ${pairedWallKind === "AWS" ? "with-aws" : "with-local"} (v3 doc vs mapper v3)\n\n` +
        formatPairedWallDeltaMarkdown(lastWallDeltaRows);
      appendFileSync(breakdownOutFile, "\n\n" + md, "utf8");
      console.error(style("32", `  [Appended paired ${pairedWallKind === "AWS" ? "with-aws" : "with-local"} Δ wall to ${breakdownOutFile}]`));
      console.error("");
    }
  }

  warnMapperV3ShouldNotBeatRawV3Doc(
    results,
    wantBreakdown && breakdownSummaries.length > 0 ? breakdownSummaries : undefined,
    wantPairedBreakdown && !!breakdownMeter,
    (wantPairedWithLocal && withLocal) || (wantPairedWithAws && withAws),
    wantColdClient
  );

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
