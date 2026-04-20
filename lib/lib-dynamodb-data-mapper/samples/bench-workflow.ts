/**
 * **Practical benchmark combo** — orchestrates scripts from this package in one place.
 *
 * | Phase | Script | Timer | Needs DynamoDB Local |
 * |-------|--------|-------|----------------------|
 * | **smoke** | `minimal-query-bench.ts` | **TinyBench** | **Yes** |
 * | **cost** | `micro-bench-comparison.ts --measure-only` | hrtime (no HTTP) | No |
 * | **paired** | `... --measure-only --breakdown --paired-breakdown` + repeats | hrtime, **same-window** v3 doc vs mapper | No |
 * | **local** | `... --paired-with-local` + repeats | hrtime, paired on Local | **Yes** |
 * | **tuned-local** | same + **long** warmup/measure, repeats=10, **`MICRO_BENCH_GC=1`**, **`node --expose-gc`** | same | **Yes** |
 *
 * **TinyBench** is used only in **`minimal-query-bench`** (quick Local smoke). Fair **v3 doc vs mapper** pairing
 * (same measure window, **Δ** per op) lives in **`micro-bench-comparison`** — it does not use TinyBench because
 * paired raw/mapper iterations are interleaved in one loop; TinyBench measures independent tasks.
 *
 * **Usage** (from `lib/lib-dynamodb-data-mapper`):
 * - `yarn sample:bench:workflow` — runs **smoke → cost → paired** (default `--phase=all`).
 * - `yarn sample:bench:workflow -- --phase=full` — **all** plus **tuned-local** (paired on Local with tuned env + `--expose-gc`).
 * - `yarn sample:bench:workflow -- --phase=tuned-local` — tuned paired-with-local only (K-run invariant tuning).
 * - `yarn sample:bench:workflow -- --phase=smoke` — TinyBench smoke only.
 * - `yarn sample:bench:workflow -- --phase=cost` — measure-only matrix only.
 * - `yarn sample:bench:workflow -- --repeats=5` — forwarded to paired phases (`MICRO_BENCH_REPEATS` also works).
 *
 * **Env:** `AWS_SDK_JS_SUPPRESS_MAINTENANCE_MODE_MESSAGE=1` is set for comparison runs.
 * **`BENCH_WORKFLOW_QUIET_SMOKE=1`** sets `MINIMAL_QUERY_TB_SKIP_DEFAULT_TABLE=1` for the smoke phase (compact tables only).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.join(HERE, "..");
const TSX_CLI = path.join(PKG, "node_modules", "tsx", "dist", "cli.mjs");
const COMPARE = path.join(PKG, "samples", "micro-bench-comparison.ts");
const MINIMAL = path.join(PKG, "samples", "minimal-query-bench.ts");

function spawnTsx(
  script: string,
  args: string[],
  extraEnv: Record<string, string | undefined>,
  opts?: { exposeGc?: boolean }
): number {
  const env = { ...process.env, ...extraEnv, AWS_SDK_JS_SUPPRESS_MAINTENANCE_MODE_MESSAGE: "1" };
  const useNode = existsSync(TSX_CLI);
  const proc = useNode
    ? spawnSync(process.execPath, opts?.exposeGc ? ["--expose-gc", TSX_CLI, script, ...args] : [TSX_CLI, script, ...args], {
        cwd: PKG,
        stdio: "inherit",
        env,
      })
    : spawnSync("npx", ["--yes", "tsx", script, ...args], { cwd: PKG, stdio: "inherit", env, shell: false });
  if (proc.error) throw proc.error;
  return proc.status ?? 1;
}

/** Defaults help K-run invariants on noisy Local; override with `MICRO_BENCH_*` env. */
function tunedLocalEnv(): Record<string, string> {
  return {
    MICRO_BENCH_WARMUP_MS: process.env.MICRO_BENCH_WARMUP_MS?.trim() || "3000",
    MICRO_BENCH_MEASURE_MS: process.env.MICRO_BENCH_MEASURE_MS?.trim() || "15000",
    MICRO_BENCH_REPEATS: process.env.MICRO_BENCH_REPEATS?.trim() || "10",
    MICRO_BENCH_GC: "1",
  };
}

function parseArgs(argv: string[]): { phase: string; repeats: string } {
  let phase = "all";
  let repeats = process.env.MICRO_BENCH_REPEATS?.trim() || "5";
  for (const a of argv) {
    if (a.startsWith("--phase=")) phase = a.slice("--phase=".length).trim().toLowerCase();
    if (a.startsWith("--repeats=")) repeats = a.slice("--repeats=".length).trim();
  }
  return { phase, repeats };
}

function banner(title: string): void {
  console.log("\n");
  console.log("═".repeat(72));
  console.log(`  ${title}`);
  console.log("═".repeat(72));
  console.log("");
}

function main(): void {
  const { phase, repeats } = parseArgs(process.argv.slice(2));
  const steps: Array<{ name: string; run: () => number }> = [];

  const quietSmoke = process.env.BENCH_WORKFLOW_QUIET_SMOKE === "1";
  const smokeEnv = quietSmoke ? { MINIMAL_QUERY_TB_SKIP_DEFAULT_TABLE: "1" } : {};

  const runSmoke = () => {
    banner("Phase: smoke — TinyBench (`minimal-query-bench.ts`, DynamoDB Local)");
    return spawnTsx(MINIMAL, [], smokeEnv);
  };

  const runCost = () => {
    banner("Phase: cost — measure-only full matrix (`micro-bench-comparison --measure-only`)");
    return spawnTsx(COMPARE, ["--measure-only"], {});
  };

  const runPaired = () => {
    banner(
      `Phase: paired — v3 doc vs mapper (measure-only, breakdown, alternate order, repeats=${repeats})`
    );
    return spawnTsx(COMPARE, [
      "--measure-only",
      "--breakdown",
      "--paired-breakdown",
      "--paired-order=alternate",
      `--repeats=${repeats}`,
    ], {});
  };

  const runLocal = () => {
    banner(`Phase: paired on Local — \`--paired-with-local\` (repeats=${repeats})`);
    return spawnTsx(COMPARE, ["--paired-with-local", "--paired-order=alternate", `--repeats=${repeats}`], {});
  };

  const runTunedLocal = () => {
    const e = tunedLocalEnv();
    banner(
      `Phase: paired on Local (TUNED for K-run invariants) — warmup ${e.MICRO_BENCH_WARMUP_MS}ms · measure ${e.MICRO_BENCH_MEASURE_MS}ms · repeats ${e.MICRO_BENCH_REPEATS} · MICRO_BENCH_GC=1 · node --expose-gc`
    );
    return spawnTsx(
      COMPARE,
      ["--paired-with-local", "--paired-order=alternate", `--repeats=${e.MICRO_BENCH_REPEATS}`],
      e,
      { exposeGc: true }
    );
  };

  if (phase === "smoke") steps.push({ name: "smoke", run: runSmoke });
  else if (phase === "cost") steps.push({ name: "cost", run: runCost });
  else if (phase === "paired") steps.push({ name: "paired", run: runPaired });
  else if (phase === "local") steps.push({ name: "local", run: runLocal });
  else if (phase === "tuned-local") steps.push({ name: "tuned-local", run: runTunedLocal });
  else if (phase === "all") {
    steps.push({ name: "smoke", run: runSmoke }, { name: "cost", run: runCost }, { name: "paired", run: runPaired });
  } else if (phase === "full") {
    steps.push(
      { name: "smoke", run: runSmoke },
      { name: "cost", run: runCost },
      { name: "paired", run: runPaired },
      { name: "tuned-local", run: runTunedLocal }
    );
  } else {
    console.error(
      `Unknown --phase=${phase}. Use: smoke | cost | paired | local | tuned-local | all | full (all+tuned-local).`
    );
    process.exit(1);
  }

  console.log(
    styleDim(
      "bench-workflow: TinyBench only in the smoke phase; paired/cost use micro-bench-comparison (hrtime)."
    )
  );

  for (const { name, run } of steps) {
    const code = run();
    if (code !== 0) {
      console.error(`\n[bench-workflow] Phase "${name}" exited with ${code}. Stopping.\n`);
      process.exit(code);
    }
  }

  banner("bench-workflow: done");
  console.log(styleDim("  Next: interpret paired Δ tables in micro-bench-comparison output; smoke = quick sanity only.\n"));
}

function styleDim(s: string): string {
  if (process.env.NO_COLOR !== undefined) return s;
  return `\x1b[2m${s}\x1b[0m`;
}

main();
