/**
 * Minimal **`put` / `get` / `update` / `query` / `delete`** benchmark on **DynamoDB Local** (default) or **measure-only**
 * (fake handler, no socket): **TinyBench** only — same stacks as `samples/micro-bench-comparison.ts`: **`v3 doc`**,
 * **mapper v3**, **Toolbox**, **ElectroDB**, **Dynamoose**.
 *
 * Setup:
 * - **Default (Local):** inline `DynamoDBClient` + `DynamoDBDocumentClient`; seed three rows under one partition;
 *   shape check: raw **query** vs mapper **query** → 3 items each.
 * - **`--measure-only`** (or **`MINIMAL_QUERY_MEASURE_ONLY=1`**): reuses `buildMeasureOnlySharedDynamoDb` from
 *   `./measure-only-client` so **`ddb.send`** never touches the network — the v3 middleware chain (serialize →
 *   sign/retry → deserialize) still runs. Removes RTT so **library overhead** (mapper schema walk, Toolbox builder,
 *   Electro composite keys, Dynamoose hooks) is legible next to raw `docClient.send(...)`. **No** `ensureUserTable`
 *   / `seed` / shape probe in this mode.
 *
 * Task order matches `micro-bench-comparison.ts`: **put → get → update → query → delete** so **query** runs after
 * **update** and before **delete** removes the keyed row (`ROWS[0]`).
 *
 * **`MINIMAL_QUERY_N_OPS_PER_ITER`** (default **1**, range **1–100**): runs **N** ops inside each TinyBench task
 * callback, amortizing bench per-iteration overhead so steady-state library differences widen. With **N \> 1**,
 * reported p50 / mean are **per iteration of N ops**; divide by **N** for per-op numbers.
 *
 * **`MICRO_BENCH_GC=1`** + **`node --expose-gc`**: optional `global.gc()` immediately before **`Bench.run`**.
 *
 * Optional timing overrides (ms, positive integers, capped at 120000):
 * - **`MINIMAL_QUERY_TB_WARMUP_MS`** (default **400**)
 * - **`MINIMAL_QUERY_TB_TIME_MS`** (default **2500**)
 *
 * Display:
 * - **Compact tables** — median & mean latency in **ms** (numeric cells), stacks × ops.
 * - **TinyBench default** — `bench.table()` per-task rows (latency ns, throughput, samples) after the compact summary.
 * - **`MINIMAL_QUERY_TB_SKIP_DEFAULT_TABLE=1`**: omit the TinyBench default table (compact only).
 *
 * Before **`Bench.run`** (Local only), the script **primes** shared `docClient` v3 paths once (Put → Get → Update →
 * Query) so **`v3 doc: put`** is not the only completely cold `send` (same idea as `primeSharedV3DocBaseline` in
 * `micro-bench-comparison.ts`). **`MINIMAL_QUERY_TB_SKIP_PRIME=1`** disables priming; measure-only mode primes
 * automatically when enabled (no `ensureUserTable` required).
 *
 * **Put tasks:** each TinyBench iteration builds the **wire item** inside the task callback (`{ ...BENCH_ROW, …pk/sk }`
 * for **v3 doc**; fresh `{ ...BENCH_ROW }` for **mapper** / **Electro**) so timing includes plain-object allocation +
 * spread, not a reused closed-over reference for v3.
 *
 * **`--paired`** (or **`MINIMAL_QUERY_PAIRED=1`**): after the regular TinyBench run, runs all five stacks
 * (**`v3 doc: put`**, **`mapper v3: put`**, **`toolbox: put`**, **`electrodb: put`**, **`dynamoose: put`**)
 * in the **same** measure window per iteration — one 5-tuple per loop tick, so GC / JIT / OS scheduling
 * noise is shared rather than split across five separate task windows. Prints per-stack p50 / mean / p90
 * and Δ stats (**mapper − raw**, **toolbox − raw**, **electrodb − raw**, **dynamoose − raw**: sign-test
 * fraction and **z**). Same physics as `--paired-breakdown` / `--paired-with-local` in
 * `micro-bench-comparison.ts`, extended to five stacks. Use
 * **`--paired-order=alternate|raw-first|mapper-first|toolbox-first|electrodb-first|dynamoose-first`**
 * (default **alternate** — rotates through all **120** permutations of the five stacks by `i % 120` so
 * each stack gets an equal share of first-slot). **Δ**s are **always** `x − raw` regardless of execution
 * order.
 *
 * Run: `npx --yes tsx samples/minimal-query-bench.ts` · `yarn sample:bench:minimal-query`
 *
 * **Workflow:** For measure-only + paired v3 vs mapper + optional Local paired, use **`yarn sample:bench:workflow`**
 * (`samples/bench-workflow.ts`) — this file is the **TinyBench Local smoke** step only.
 */
import { DynamoDB, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient as DocClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
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
import { Bench } from "tinybench";

import { physicalKeyFromRow } from "../src/schema";
import { buildMeasureOnlySharedDynamoDb, userItemToAttributeMap } from "./measure-only-client";
import { ensureUserTable, USER_TABLE_NAME, UserSchema, userTableHandle } from "./user-table";

const TABLE = USER_TABLE_NAME;
const LOCAL_ENDPOINT = "http://localhost:8000";

const PARTITION_USER_ID = "minbench-user-42";
const ROWS = [
  { userId: PARTITION_USER_ID, profileKey: "a", name: "Alice", email: "a@example.com", version: 1 },
  { userId: PARTITION_USER_ID, profileKey: "b", name: "Bob", email: "b@example.com", version: 1 },
  { userId: PARTITION_USER_ID, profileKey: "c", name: "Carol", email: "c@example.com", version: 1 },
] as const;

/** Single-row targets for put / get / delete (same wire item shape as `micro-bench-comparison.ts`). */
const BENCH_ROW = ROWS[0]!;
const MAPPER_KEY = { userId: BENCH_ROW.userId, profileKey: BENCH_ROW.profileKey } as const;

function parseEnvPositiveIntMs(key: string, defaultVal: number, maxMs: number): number {
  const raw = process.env[key]?.trim();
  if (!raw || !/^\d+$/.test(raw)) return defaultVal;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return defaultVal;
  return Math.min(n, maxMs);
}

const TB_WARMUP_MS = parseEnvPositiveIntMs("MINIMAL_QUERY_TB_WARMUP_MS", 400, 120_000);
const TB_TIME_MS = parseEnvPositiveIntMs("MINIMAL_QUERY_TB_TIME_MS", 2500, 120_000);

/** Fake-handler mode: runs the full SDK stack without socket I/O (library overhead becomes legible). */
const MEASURE_ONLY =
  process.argv.includes("--measure-only") || process.env.MINIMAL_QUERY_MEASURE_ONLY === "1";

/** Runs N ops per TinyBench iteration; p50/mean are **per iteration of N ops** when N \> 1. */
function parseNOpsPerIter(): number {
  const raw = process.env.MINIMAL_QUERY_N_OPS_PER_ITER?.trim();
  if (!raw || !/^\d+$/.test(raw)) return 1;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 100);
}
const N_OPS_PER_ITER = parseNOpsPerIter();

/** Wraps a single-op runner into an N-op runner; when N=1 returns the input unchanged (no overhead). */
function times<T>(n: number, runner: () => Promise<T>): () => Promise<void> {
  if (n <= 1) return runner as unknown as () => Promise<void>;
  return async () => {
    for (let i = 0; i < n; i++) {
      await runner();
    }
  };
}

/**
 * `--paired`: after the regular TinyBench run, runs **`v3 doc: put`** and **`mapper v3: put`** in the
 * **same** measure window per iteration (Δ = mapper − raw, same physics as `--paired-breakdown` /
 * `--paired-with-local` in `micro-bench-comparison.ts`, but a minimal single-op version).
 */
const PAIRED =
  process.argv.includes("--paired") || process.env.MINIMAL_QUERY_PAIRED === "1";

type PairedOrder =
  | "raw-first"
  | "mapper-first"
  | "toolbox-first"
  | "electrodb-first"
  | "dynamoose-first"
  | "alternate";

function parsePairedOrder(): PairedOrder {
  const arg = process.argv.find((a) => a.startsWith("--paired-order="))?.slice("--paired-order=".length).trim();
  const env = process.env.MINIMAL_QUERY_PAIRED_ORDER?.trim();
  const raw = (arg || env || "alternate").toLowerCase();
  if (
    raw === "raw-first" ||
    raw === "mapper-first" ||
    raw === "toolbox-first" ||
    raw === "electrodb-first" ||
    raw === "dynamoose-first" ||
    raw === "alternate"
  ) {
    return raw;
  }
  return "alternate";
}
const PAIRED_ORDER: PairedOrder = parsePairedOrder();

/** Stacks in the paired quintet. Δs are always computed as **`x − raw`** regardless of execution slot. */
type PairedStack = "raw" | "mapper" | "toolbox" | "electrodb" | "dynamoose";
type NonRawStack = Exclude<PairedStack, "raw">;

const ALL_STACKS: readonly PairedStack[] = ["raw", "mapper", "toolbox", "electrodb", "dynamoose"];
const NON_RAW_STACKS: readonly NonRawStack[] = ["mapper", "toolbox", "electrodb", "dynamoose"];

function generatePermutations<T>(arr: readonly T[]): T[][] {
  if (arr.length <= 1) return [[...arr]];
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of generatePermutations(rest)) result.push([arr[i]!, ...p]);
  }
  return result;
}

/** All 120 permutations of `ALL_STACKS`; `alternate` rotates by `i % 120`. */
const ALL_PERMS: readonly (readonly PairedStack[])[] = generatePermutations(ALL_STACKS);

function fixedPermStarting(head: PairedStack): readonly PairedStack[] {
  return [head, ...ALL_STACKS.filter((s) => s !== head)];
}

function pairedOrderThisIter(order: PairedOrder, iterationIndex: number): readonly PairedStack[] {
  if (order === "raw-first") return fixedPermStarting("raw");
  if (order === "mapper-first") return fixedPermStarting("mapper");
  if (order === "toolbox-first") return fixedPermStarting("toolbox");
  if (order === "electrodb-first") return fixedPermStarting("electrodb");
  if (order === "dynamoose-first") return fixedPermStarting("dynamoose");
  return ALL_PERMS[iterationIndex % ALL_PERMS.length]!;
}

type PairedRunners = Record<PairedStack, () => Promise<unknown>>;
type PairedNsByStack = Record<PairedStack, number[]>;
type PairedDeltaByStack = Record<NonRawStack, number[]>;

/**
 * Sequential paired loop for all five stacks: one iteration runs each stack back-to-back (order per
 * `order`) and records per-iteration wall time for each stack plus Δs **`x − raw`** for each non-raw
 * stack. No socket in `--measure-only`; Local `send` otherwise.
 */
async function collectPairedQuintetSmokeSamplesNs(
  runners: PairedRunners,
  warmupMs: number,
  measureMs: number,
  order: PairedOrder,
): Promise<{ stackNs: PairedNsByStack; deltas: PairedDeltaByStack }> {
  {
    const t0 = performance.now();
    let i = 0;
    while (performance.now() - t0 < warmupMs) {
      const perm = pairedOrderThisIter(order, i);
      for (const stack of perm) await runners[stack]();
      i++;
    }
  }

  const stackNs: PairedNsByStack = {
    raw: [],
    mapper: [],
    toolbox: [],
    electrodb: [],
    dynamoose: [],
  };
  const deltas: PairedDeltaByStack = {
    mapper: [],
    toolbox: [],
    electrodb: [],
    dynamoose: [],
  };

  const t0 = performance.now();
  let i = 0;
  while (performance.now() - t0 < measureMs) {
    const perm = pairedOrderThisIter(order, i);
    const thisIterNs: Partial<Record<PairedStack, number>> = {};
    for (const stack of perm) {
      const start = process.hrtime.bigint();
      await runners[stack]();
      thisIterNs[stack] = Number(process.hrtime.bigint() - start);
    }
    const rawNs = thisIterNs.raw!;
    for (const stack of ALL_STACKS) stackNs[stack].push(thisIterNs[stack]!);
    for (const stack of NON_RAW_STACKS) deltas[stack].push(thisIterNs[stack]! - rawNs);
    i++;
  }

  return { stackNs, deltas };
}

function percentileAsc(sortedAsc: readonly number[], p: number): number {
  if (sortedAsc.length === 0) return NaN;
  const pos = (sortedAsc.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = sortedAsc[lo]!;
  const b = sortedAsc[hi]!;
  return lo === hi ? a : a + (b - a) * (pos - lo);
}

function summarizeNsSamples(samplesNs: readonly number[]): {
  n: number;
  meanNs: number;
  p50Ns: number;
  p90Ns: number;
} {
  const n = samplesNs.length;
  if (n === 0) return { n, meanNs: NaN, p50Ns: NaN, p90Ns: NaN };
  const sum = samplesNs.reduce((a, b) => a + b, 0);
  const sorted = [...samplesNs].sort((x, y) => x - y);
  return { n, meanNs: sum / n, p50Ns: percentileAsc(sorted, 0.5), p90Ns: percentileAsc(sorted, 0.9) };
}

function summarizePairedDelta(deltaNs: readonly number[]): {
  n: number;
  meanNs: number;
  p50Ns: number;
  p90Ns: number;
  nPositive: number;
  fracPositive: number;
  /** Normal-approximation sign-test `z` for H0: median(Δ) = 0; `|z|` ≳ 2 rejects at ~5% two-sided. */
  signZ: number;
} {
  const base = summarizeNsSamples(deltaNs);
  let nPositive = 0;
  for (const v of deltaNs) if (v > 0) nPositive++;
  const n = deltaNs.length;
  const fracPositive = n === 0 ? NaN : nPositive / n;
  const signZ = n === 0 ? NaN : (2 * nPositive - n) / Math.sqrt(n);
  return { ...base, nPositive, fracPositive, signZ };
}

function nsToMs(ns: number): number {
  return Math.round((ns / 1e6) * 1000) / 1000;
}

/** `(stackNs - rawNs) / rawNs × 100`, rounded to 1 decimal. `NaN` when `rawNs ≤ 0` or inputs are `NaN`. */
function pctOverRaw(stackNs: number, rawNs: number): number {
  if (!Number.isFinite(stackNs) || !Number.isFinite(rawNs) || rawNs <= 0) return NaN;
  return Math.round(((stackNs - rawNs) / rawNs) * 1000) / 10;
}

/** Formats a percentage as `+xx.x%` / `-xx.x%` / `n/a`. */
function fmtPct(pct: number): string {
  if (!Number.isFinite(pct)) return "n/a";
  const s = pct >= 0 ? "+" : "";
  return `${s}${pct.toFixed(1)}%`;
}

function fmtSignedZ(z: number): string {
  if (Number.isNaN(z)) return "n/a";
  const s = z >= 0 ? "+" : "";
  return `${s}${z.toFixed(2)}`;
}

/** Human-friendly column / delta labels for the paired quintet. */
const STACK_LABEL: Record<PairedStack, string> = {
  raw: "v3 doc",
  mapper: "mapper v3",
  toolbox: "toolbox",
  electrodb: "electrodb",
  dynamoose: "dynamoose",
};

function printPairedQuintetSmokeSummary(
  stackNs: PairedNsByStack,
  deltas: PairedDeltaByStack,
): void {
  const perStack = {
    raw: summarizeNsSamples(stackNs.raw),
    mapper: summarizeNsSamples(stackNs.mapper),
    toolbox: summarizeNsSamples(stackNs.toolbox),
    electrodb: summarizeNsSamples(stackNs.electrodb),
    dynamoose: summarizeNsSamples(stackNs.dynamoose),
  } as const;
  const deltaStats = {
    mapper: summarizePairedDelta(deltas.mapper),
    toolbox: summarizePairedDelta(deltas.toolbox),
    electrodb: summarizePairedDelta(deltas.electrodb),
    dynamoose: summarizePairedDelta(deltas.dynamoose),
  } as const;

  console.log(
    style(
      "1;37",
      "Paired — v3 doc / mapper / toolbox / electrodb / dynamoose : put (same window, Δ = x − raw)",
    ),
  );
  console.log(
    style(
      "2",
      `  order: ${PAIRED_ORDER}${N_OPS_PER_ITER > 1 ? ` · N_OPS_PER_ITER=${N_OPS_PER_ITER} (each stack runs ${N_OPS_PER_ITER} ops per iteration; per-iteration wall is ${N_OPS_PER_ITER}-op)` : ""}`,
    ),
  );
  console.log("");

  console.table([
    {
      metric: "p50 (ms)",
      [STACK_LABEL.raw]: nsToMs(perStack.raw.p50Ns),
      [STACK_LABEL.mapper]: nsToMs(perStack.mapper.p50Ns),
      [STACK_LABEL.toolbox]: nsToMs(perStack.toolbox.p50Ns),
      [STACK_LABEL.electrodb]: nsToMs(perStack.electrodb.p50Ns),
      [STACK_LABEL.dynamoose]: nsToMs(perStack.dynamoose.p50Ns),
    },
    {
      metric: "mean (ms)",
      [STACK_LABEL.raw]: nsToMs(perStack.raw.meanNs),
      [STACK_LABEL.mapper]: nsToMs(perStack.mapper.meanNs),
      [STACK_LABEL.toolbox]: nsToMs(perStack.toolbox.meanNs),
      [STACK_LABEL.electrodb]: nsToMs(perStack.electrodb.meanNs),
      [STACK_LABEL.dynamoose]: nsToMs(perStack.dynamoose.meanNs),
    },
    {
      metric: "p90 (ms)",
      [STACK_LABEL.raw]: nsToMs(perStack.raw.p90Ns),
      [STACK_LABEL.mapper]: nsToMs(perStack.mapper.p90Ns),
      [STACK_LABEL.toolbox]: nsToMs(perStack.toolbox.p90Ns),
      [STACK_LABEL.electrodb]: nsToMs(perStack.electrodb.p90Ns),
      [STACK_LABEL.dynamoose]: nsToMs(perStack.dynamoose.p90Ns),
    },
  ]);

  console.table([
    {
      metric: "p50 Δ (ms)",
      "Δ mapper−raw": nsToMs(deltaStats.mapper.p50Ns),
      "Δ toolbox−raw": nsToMs(deltaStats.toolbox.p50Ns),
      "Δ electrodb−raw": nsToMs(deltaStats.electrodb.p50Ns),
      "Δ dynamoose−raw": nsToMs(deltaStats.dynamoose.p50Ns),
    },
    {
      metric: "mean Δ (ms)",
      "Δ mapper−raw": nsToMs(deltaStats.mapper.meanNs),
      "Δ toolbox−raw": nsToMs(deltaStats.toolbox.meanNs),
      "Δ electrodb−raw": nsToMs(deltaStats.electrodb.meanNs),
      "Δ dynamoose−raw": nsToMs(deltaStats.dynamoose.meanNs),
    },
    {
      metric: "p90 Δ (ms)",
      "Δ mapper−raw": nsToMs(deltaStats.mapper.p90Ns),
      "Δ toolbox−raw": nsToMs(deltaStats.toolbox.p90Ns),
      "Δ electrodb−raw": nsToMs(deltaStats.electrodb.p90Ns),
      "Δ dynamoose−raw": nsToMs(deltaStats.dynamoose.p90Ns),
    },
  ]);

  console.table([
    {
      metric: "p50 Δ % vs raw",
      "mapper v3": fmtPct(pctOverRaw(perStack.mapper.p50Ns, perStack.raw.p50Ns)),
      toolbox: fmtPct(pctOverRaw(perStack.toolbox.p50Ns, perStack.raw.p50Ns)),
      electrodb: fmtPct(pctOverRaw(perStack.electrodb.p50Ns, perStack.raw.p50Ns)),
      dynamoose: fmtPct(pctOverRaw(perStack.dynamoose.p50Ns, perStack.raw.p50Ns)),
    },
    {
      metric: "mean Δ % vs raw",
      "mapper v3": fmtPct(pctOverRaw(perStack.mapper.meanNs, perStack.raw.meanNs)),
      toolbox: fmtPct(pctOverRaw(perStack.toolbox.meanNs, perStack.raw.meanNs)),
      electrodb: fmtPct(pctOverRaw(perStack.electrodb.meanNs, perStack.raw.meanNs)),
      dynamoose: fmtPct(pctOverRaw(perStack.dynamoose.meanNs, perStack.raw.meanNs)),
    },
    {
      metric: "p90 Δ % vs raw",
      "mapper v3": fmtPct(pctOverRaw(perStack.mapper.p90Ns, perStack.raw.p90Ns)),
      toolbox: fmtPct(pctOverRaw(perStack.toolbox.p90Ns, perStack.raw.p90Ns)),
      electrodb: fmtPct(pctOverRaw(perStack.electrodb.p90Ns, perStack.raw.p90Ns)),
      dynamoose: fmtPct(pctOverRaw(perStack.dynamoose.p90Ns, perStack.raw.p90Ns)),
    },
  ]);

  const n = deltaStats.mapper.n;
  console.log(`  ${style("1;36", "iterations")}: ${n}`);
  for (const stack of NON_RAW_STACKS) {
    const d = deltaStats[stack];
    console.log(
      `  ${style("1;36", `Δ ${STACK_LABEL[stack]}−raw`)}: ${d.nPositive}/${d.n} (${d.fracPositive.toFixed(3)}) z=${fmtSignedZ(d.signZ)}`,
    );
  }
  console.log(
    style(
      "2",
      "  Interpretation: for each non-raw stack, Δ p50 > 0 AND Δ>0 > 0.5 AND |z| ≥ 2 ⇒ that stack is consistently slower than v3 doc in the same window (expected layer overhead). Dynamoose hits raw `DynamoDB.*Item(...)`; the others go through `DynamoDBDocumentClient`.",
    ),
  );
  console.log("");
}

const OPS_ORDER = ["put", "get", "update", "query", "delete"] as const;
type BenchOp = (typeof OPS_ORDER)[number];

/** Display order matches task registration groups. */
const STACK_ORDER = ["v3 doc", "mapper v3", "toolbox", "electrodb", "dynamoose"] as const;

/** ms with 3 decimal places, as a **number** (not a string) for `console.table`. */
function msDisplayNumber(ms: number): number {
  return Math.round(ms * 1000) / 1000;
}

/** `v3 doc: QueryCommand` → op `query`, `v3 doc: UpdateCommand` → op `update`. */
function normalizeBenchOp(raw: string): BenchOp | undefined {
  const x = raw.trim().toLowerCase();
  if (x === "querycommand" || x === "query") return "query";
  if (x === "put") return "put";
  if (x === "get") return "get";
  if (x === "delete") return "delete";
  if (x === "update") return "update";
  if (x === "updatecommand") return "update";
  return undefined;
}

function parseTaskStackAndOp(name: string): { stack: string; op: BenchOp } | undefined {
  const sep = name.lastIndexOf(": ");
  if (sep < 1) return undefined;
  const stack = name.slice(0, sep).trim();
  const tail = name.slice(sep + 2);
  const op = normalizeBenchOp(tail);
  if (!op) return undefined;
  return { stack, op };
}

type BenchTask = Bench["tasks"][number];

function taskCompletedLatency(task: BenchTask) {
  const r = task.result;
  if (r.state !== "completed") return undefined;
  return r.latency;
}

function samplesRangeMs(tasks: BenchTask[]): string {
  let minS = Infinity;
  let maxS = 0;
  for (const t of tasks) {
    const r = t.result;
    if (r.state !== "completed") continue;
    const n = r.latency.samplesCount;
    if (typeof n !== "number" || n < 1) continue;
    minS = Math.min(minS, n);
    maxS = Math.max(maxS, n);
  }
  if (!Number.isFinite(minS)) return "?";
  return minS === maxS ? String(minS) : `${minS}–${maxS}`;
}

/**
 * Readable summary: stacks × ops, latency in **ms** as numeric table cells (`number`, not stringified).
 * Missing combinations use **`null`**. TinyBench `Task.result.latency.mean` / `.p50` are already **milliseconds**.
 */
function printBenchSummaryTables(bench: Bench): void {
  type Cell = "medianMs" | "meanMs";
  const grid = new Map<string, Partial<Record<BenchOp, Record<Cell, number>>>>();

  for (const stack of STACK_ORDER) grid.set(stack, {});

  for (const task of bench.tasks) {
    const parsed = parseTaskStackAndOp(task.name);
    if (!parsed) continue;
    const lat = taskCompletedLatency(task);
    if (!lat) continue;
    const bucket = grid.get(parsed.stack);
    if (!bucket) continue;
    bucket[parsed.op] = { medianMs: lat.p50, meanMs: lat.mean };
  }

  function tableFor(which: Cell): Record<string, string | number | null>[] {
    return STACK_ORDER.map((stack) => {
      const row: Record<string, string | number | null> = { stack };
      const b = grid.get(stack);
      for (const op of OPS_ORDER) {
        const v = b?.[op]?.[which];
        row[op] = v !== undefined ? msDisplayNumber(v) : null;
      }
      return row;
    });
  }

  console.log(style("1;37", "Latency summary (ms)"));
  console.log(
    style("2", "  Values from TinyBench statistics; median = p50; mean sensitive to outliers."),
  );
  console.log("");
  console.log(style("36", "Median (p50)"));
  console.table(tableFor("medianMs"));
  console.log(style("36", "Mean"));
  console.table(tableFor("meanMs"));
  console.log(style("2", `  Samples per task: ${samplesRangeMs(bench.tasks)}`));
  console.log("");
}

function colorEnabled(): boolean {
  if (process.env.NO_COLOR !== undefined || process.env.FORCE_COLOR === "0") return false;
  return process.stdout.isTTY === true || process.stderr.isTTY === true;
}

function style(code: string, text: string): string {
  if (!colorEnabled()) return text;
  return `\x1b[${code}m${text}\x1b[0m`;
}

function maybeGc(label: string): void {
  if (process.env.MICRO_BENCH_GC !== "1") return;
  const gc = (globalThis as unknown as { gc?: () => void }).gc;
  if (typeof gc !== "function") {
    console.error(
      style(
        "33",
        `[bench] MICRO_BENCH_GC=1 but global.gc unavailable — use: node --expose-gc (${label})`,
      ),
    );
    return;
  }
  gc();
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
        version: { type: "number" },
      },
      indexes: {
        byUser: {
          pk: { field: "pk", composite: ["userId"], template: "${userId}" },
          sk: { field: "sk", composite: ["profileKey"], template: "${profileKey}" },
        },
      },
    },
    { client: docClient, table: TABLE },
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

async function seed(docClient: DynamoDBDocumentClient): Promise<void> {
  for (const r of ROWS) {
    const keyAttrs = physicalKeyFromRow(UserSchema, r);
    await docClient.send(new PutCommand({ TableName: TABLE, Item: { ...r, ...keyAttrs } }));
  }
}

async function rawQuery(docClient: DynamoDBDocumentClient, pkPartition: string): Promise<unknown> {
  return docClient.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "#pk = :pk",
      ExpressionAttributeNames: { "#pk": "pk" },
      ExpressionAttributeValues: { ":pk": pkPartition },
    }),
  );
}

async function rawPut(
  docClient: DynamoDBDocumentClient,
  item: Record<string, unknown>,
): Promise<unknown> {
  return docClient.send(new PutCommand({ TableName: TABLE, Item: item }));
}

async function rawGet(docClient: DynamoDBDocumentClient, pk: string, sk: string): Promise<unknown> {
  return docClient.send(new GetCommand({ TableName: TABLE, Key: { pk, sk } }));
}

async function rawDelete(
  docClient: DynamoDBDocumentClient,
  pk: string,
  sk: string,
): Promise<unknown> {
  return docClient.send(new DeleteCommand({ TableName: TABLE, Key: { pk, sk } }));
}

/** Same `UpdateCommand` shape as `micro-bench-comparison.ts` (SET name + version). */
async function rawUpdate(
  docClient: DynamoDBDocumentClient,
  pk: string,
  sk: string,
): Promise<unknown> {
  return docClient.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { pk, sk },
      UpdateExpression: "SET #n0 = :v0, #n1 = :v1",
      ExpressionAttributeNames: { "#n0": "name", "#n1": "version" },
      ExpressionAttributeValues: { ":v0": "Bob", ":v1": 2 },
    }),
  );
}

/**
 * One pass over raw v3 doc Put/Get/Update/Query so the **first TinyBench task** is not the only cold stack
 * for those API shapes (omit **Delete** so we do not remove `ROWS[0]` before the bench).
 */
async function primeDocClientV3Paths(
  docClient: DynamoDBDocumentClient,
  item: Record<string, unknown>,
  pk: string,
  sk: string,
  partition: string,
): Promise<void> {
  await rawPut(docClient, item);
  await rawGet(docClient, pk, sk);
  await rawUpdate(docClient, pk, sk);
  await rawQuery(docClient, partition);
}

async function main() {
  const benchPhysicalEarly = physicalKeyFromRow(
    UserSchema,
    BENCH_ROW as unknown as Record<string, unknown>,
  );

  let docClient: DynamoDBDocumentClient;
  if (MEASURE_ONLY) {
    const fakeDdb = buildMeasureOnlySharedDynamoDb(
      userItemToAttributeMap({
        pk: benchPhysicalEarly.pk,
        sk: benchPhysicalEarly.sk,
        userId: BENCH_ROW.userId,
        profileKey: BENCH_ROW.profileKey,
        name: BENCH_ROW.name,
        email: BENCH_ROW.email,
        version: BENCH_ROW.version,
      }),
    );
    docClient = DocClient.from(fakeDdb);
    dynamoose.aws.ddb.set(fakeDdb);
  } else {
    const ddbClient = new DynamoDBClient({
      endpoint: LOCAL_ENDPOINT,
      region: "us-east-1",
      credentials: { accessKeyId: "local", secretAccessKey: "local" },
    });
    docClient = DocClient.from(ddbClient);
    dynamoose.aws.ddb.set(
      new DynamoDB({
        endpoint: LOCAL_ENDPOINT,
        region: process.env.AWS_REGION ?? "us-east-1",
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "local",
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "local",
        },
      }),
    );

    await ensureUserTable(ddbClient);
    await seed(docClient);
  }

  const mapper = userTableHandle(docClient);
  const { toolboxTable, toolboxEntity } = buildToolboxTableAndEntity(docClient);
  const ElectroUser = buildElectroEntity(docClient);
  const DynUser = buildDynamooseModel();

  const benchPhysical = physicalKeyFromRow(
    UserSchema,
    BENCH_ROW as unknown as Record<string, unknown>,
  );
  const benchPk = benchPhysical.pk;
  const benchSk = benchPhysical.sk;
  const benchItem: Record<string, unknown> = { ...BENCH_ROW, ...benchPhysical };
  const pkPartition = benchPk;

  console.log(
    style("1;37", "\n═══════════════════════════════════════════════════════════════════"),
  );
  console.log(
    style("1;37", "  Minimal op bench — ") +
      style(
        "36",
        `TinyBench · put/get/update/query/delete · v3 / mapper / toolbox / electrodb / dynamoose · ${MEASURE_ONLY ? "measure-only (fake handler, no socket)" : "Local"}`,
      ),
  );
  console.log(
    style("1;37", "═══════════════════════════════════════════════════════════════════\n"),
  );

  console.log(
    style(
      "2",
      `TinyBench budget: warmup ${TB_WARMUP_MS}ms · run ${TB_TIME_MS}ms per task (override via MINIMAL_QUERY_TB_*_MS)`,
    ),
  );
  if (N_OPS_PER_ITER > 1) {
    console.log(
      style(
        "33",
        `  MINIMAL_QUERY_N_OPS_PER_ITER=${N_OPS_PER_ITER} — p50 / mean are **per iteration of ${N_OPS_PER_ITER} ops** (divide by ${N_OPS_PER_ITER} for per-op).`,
      ),
    );
  }
  if (MEASURE_ONLY) {
    console.log(
      style(
        "33",
        "  --measure-only: fake requestHandler returns canned DynamoDB JSON per X-Amz-Target; no socket I/O. Library overhead visible; not comparable to Local numbers.",
      ),
    );
  }
  if (PAIRED) {
    console.log(
      style(
        "33",
        `  --paired: after the regular bench, runs v3 doc: put + mapper v3: put in the same window per iteration (order=${PAIRED_ORDER}) and prints Δ stats.`,
      ),
    );
  }
  console.log(style("2", "Client identity"));
  console.log(
    `  ${style("1;36", "docClient")}                : ${style("37", docClient.constructor.name)}`,
  );
  console.log(
    `  ${style("1;36", "mapper.forTable(client)")} : ${style("2", "same docClient as raw path (src/table.ts)")}`,
  );
  console.log(`  ${style("1;36", "partition pk (query)")}  : ${style("37", pkPartition)}`);
  console.log(
    `  ${style("1;36", "put/get/update/delete key")} : ${style("37", `pk=${benchPk} sk=${benchSk}`)}`,
  );
  console.log("");

  if (!MEASURE_ONLY) {
    const probeRaw = await rawQuery(docClient, pkPartition);
    const probeMap = await mapper.query({ userId: PARTITION_USER_ID });
    const rawCount = (probeRaw as { Items?: unknown[] }).Items?.length ?? 0;
    const mapCount = probeMap.length;
    console.log(
      `${style("32", "✓")} Shape check: raw ${style("37", String(rawCount))} items · mapper ${style("37", String(mapCount))} items ${style("2", "(expect 3 each)")}`,
    );
    if (rawCount !== 3 || mapCount !== 3) {
      console.error(style("31", "Unexpected item count — seed the table or fix the partition."));
      process.exit(1);
    }
    console.log("");
  } else {
    console.log(
      style(
        "2",
        "Shape check skipped in --measure-only (fake handler returns a canned single item).",
      ),
    );
    console.log("");
  }

  maybeGc("before Bench.run");

  if (process.env.MINIMAL_QUERY_TB_SKIP_PRIME !== "1") {
    await primeDocClientV3Paths(docClient, benchItem, benchPk, benchSk, pkPartition);
    console.log(
      style(
        "2",
        `Primed v3 doc Put → Get → Update → Query on shared docClient${MEASURE_ONLY ? " (fake handler)" : ""} (first TinyBench task is no longer the only cold send). Skip: MINIMAL_QUERY_TB_SKIP_PRIME=1.`,
      ),
    );
    console.log("");
  }

  console.log(style("1;37", "TinyBench — independent tasks (not paired)"));
  console.log(
    style(
      "2",
      MEASURE_ONLY
        ? "  Tasks run sequentially per TinyBench defaults; stats are per-task windows (library overhead dominates — no RTT)."
        : "  Tasks run sequentially per TinyBench defaults; stats are per-task windows (Local RTT dominates).",
    ),
  );
  console.log("");
  process.stderr.write(
    style("2", `Running… warmup ${TB_WARMUP_MS}ms · measure ${TB_TIME_MS}ms per task…`),
  );

  const bench = new Bench({
    name: "minimal-ops",
    warmupTime: TB_WARMUP_MS,
    time: TB_TIME_MS,
    warmup: true,
    throws: true,
    retainSamples: true,
    timestampProvider: "hrtimeNow",
  });

  bench
    .add(
      "v3 doc: put",
      times(N_OPS_PER_ITER, () =>
        rawPut(docClient, {
          ...BENCH_ROW,
          ...benchPhysical,
        }),
      ),
    )
    .add(
      "mapper v3: put",
      times(N_OPS_PER_ITER, () => mapper.put({ ...BENCH_ROW })),
    )
    .add(
      "toolbox: put",
      times(N_OPS_PER_ITER, () =>
        toolboxEntity
          .build(PutItemCommand)
          .item({
            pk: benchPk,
            sk: benchSk,
            userId: BENCH_ROW.userId,
            profileKey: BENCH_ROW.profileKey,
            name: BENCH_ROW.name,
            email: BENCH_ROW.email,
            version: BENCH_ROW.version,
          })
          .send(),
      ),
    );
  // .add("electrodb: put", () => ElectroUser.put({ ...BENCH_ROW }).go());
  // .add("dynamoose: put", () =>
  //   DynUser.create(
  //     {
  //       pk: benchPk,
  //       sk: benchSk,
  //       userId: BENCH_ROW.userId,
  //       profileKey: BENCH_ROW.profileKey,
  //       name: BENCH_ROW.name,
  //       email: BENCH_ROW.email,
  //       version: BENCH_ROW.version,
  //     },
  //     { overwrite: true },
  //   ),
  // );
  // .add("v3 doc: get", () => rawGet(docClient, benchPk, benchSk))
  // .add("mapper v3: get", () => mapper.get(MAPPER_KEY))
  // .add("toolbox: get", () => toolboxEntity.build(GetItemCommand).key({ pk: benchPk, sk: benchSk }).send())
  // .add("electrodb: get", () => ElectroUser.get({ userId: BENCH_ROW.userId, profileKey: BENCH_ROW.profileKey }).go())
  // .add("dynamoose: get", () => DynUser.get({ pk: benchPk, sk: benchSk }))
  // .add("v3 doc: update", () => rawUpdate(docClient, benchPk, benchSk))
  // .add("mapper v3: update", () => mapper.update(MAPPER_KEY, { set: { name: "Bob", version: 2 } }))
  // .add("toolbox: update", () =>
  //   toolboxEntity.build(UpdateItemCommand).item({ pk: benchPk, sk: benchSk, name: "Bob", version: 2 }).send()
  // )
  // .add("electrodb: update", () =>
  //   ElectroUser.patch({ userId: BENCH_ROW.userId, profileKey: BENCH_ROW.profileKey })
  //     .set({ name: "Bob", version: 2 })
  //     .go()
  // )
  // .add("dynamoose: update", () => DynUser.update({ pk: benchPk, sk: benchSk }, { name: "Bob", version: 2 }))
  // .add("v3 doc: QueryCommand", () => rawQuery(docClient, pkPartition))
  // .add("mapper v3: query", () => mapper.query({ userId: PARTITION_USER_ID }))
  // .add("toolbox: query", () =>
  //   toolboxTable.build(ToolboxQueryCommand).entities(toolboxEntity).query({ partition: pkPartition }).send()
  // )
  // .add("electrodb: query", () => ElectroUser.query.byUser({ userId: PARTITION_USER_ID }).go())
  // .add("dynamoose: query", () => DynUser.query("pk").eq(pkPartition).exec())
  // .add("v3 doc: delete", () => rawDelete(docClient, benchPk, benchSk))
  // .add("mapper v3: delete", () => mapper.delete(MAPPER_KEY))
  // .add("toolbox: delete", () => toolboxEntity.build(DeleteItemCommand).key({ pk: benchPk, sk: benchSk }).send())
  // .add("electrodb: delete", () =>
  //   ElectroUser.delete({ userId: BENCH_ROW.userId, profileKey: BENCH_ROW.profileKey }).go()
  // )
  // .add("dynamoose: delete", () => DynUser.delete({ pk: benchPk, sk: benchSk }));

  await bench.run();
  process.stderr.write(style("32", " done.\n\n"));

  printBenchSummaryTables(bench);

  if (process.env.MINIMAL_QUERY_TB_SKIP_DEFAULT_TABLE !== "1") {
    console.log(style("1;37", "TinyBench default (bench.table)"));
    console.log(
      style(
        "2",
        "  Per-task latency/throughput/samples; labels say ns (TinyBench mToNs on ms stats).",
      ),
    );
    console.log("");
    console.table(bench.table());
    console.log("");
  }

  if (PAIRED) {
    process.stderr.write(
      style("2", `Paired run… warmup ${TB_WARMUP_MS}ms · measure ${TB_TIME_MS}ms (order=${PAIRED_ORDER})…`),
    );
    maybeGc("before paired measure");
    const runners: PairedRunners = {
      raw: times(N_OPS_PER_ITER, () =>
        rawPut(docClient, { ...BENCH_ROW, ...benchPhysical }),
      ),
      mapper: times(N_OPS_PER_ITER, () => mapper.put({ ...BENCH_ROW })),
      toolbox: times(N_OPS_PER_ITER, () =>
        toolboxEntity
          .build(PutItemCommand)
          .item({
            pk: benchPk,
            sk: benchSk,
            userId: BENCH_ROW.userId,
            profileKey: BENCH_ROW.profileKey,
            name: BENCH_ROW.name,
            email: BENCH_ROW.email,
            version: BENCH_ROW.version,
          })
          .send(),
      ),
      electrodb: times(N_OPS_PER_ITER, () => ElectroUser.put({ ...BENCH_ROW }).go()),
      dynamoose: times(N_OPS_PER_ITER, () =>
        DynUser.create(
          {
            pk: benchPk,
            sk: benchSk,
            userId: BENCH_ROW.userId,
            profileKey: BENCH_ROW.profileKey,
            name: BENCH_ROW.name,
            email: BENCH_ROW.email,
            version: BENCH_ROW.version,
          },
          { overwrite: true },
        ),
      ),
    };
    const { stackNs, deltas } = await collectPairedQuintetSmokeSamplesNs(
      runners,
      TB_WARMUP_MS,
      TB_TIME_MS,
      PAIRED_ORDER,
    );
    process.stderr.write(style("32", " done.\n\n"));
    printPairedQuintetSmokeSummary(stackNs, deltas);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
