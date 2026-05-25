# Proposed DynamoDB DataMapper: delivery roadmap

**Purpose:** Replace a single fixed GA date with **phased milestones**, **per-phase ETAs**, and a **derived GA window** once program start and staffing are known.

**Scope in this doc:**

- **In scope:** every committed feature of `@aws-sdk/lib-dynamodb-data-mapper` core, grouped by preview phase, plus RC and GA.
- **Not in scope:** an ODM surface, dirty tracking by default, or any other optional layer. Those are deliberately kept off this schedule. See [`DataMapper_vs_ODM.md`](./DataMapper_vs_ODM.md) for what an ODM surface would look like and why it sits outside this program.

**Companion document for review:** [`DataMapper_vs_ODM.md`](./DataMapper_vs_ODM.md) lists every committed deliverable (DataMapper column) and its hypothetical ODM-shape counterpart. This roadmap is **when** those deliverables ship.

**Planning anchor:** **T0** = agreed engineering kickoff (preview program start). All ECDs below are **T0 + N weeks** unless a calendar start date is set.

**Assumptions (edit when resourcing changes):**


| Assumption      | Default for estimates                                                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Team            | **1.5 FTE** sustained engineering (mapper + tests + docs), plus **0.25 FTE** SDK/DDB review cadence                                                                 |
| Parallelism     | Phases are mostly **sequential**. Phase 2 perf CI can overlap late Phase 1                                                                                          |
| Scope contract  | **Java Enhanced parity** as defined by this roadmap and the DataMapper column of `DataMapper_vs_ODM.md`. Scope changes go through change board after Preview 2 exit |
| Preview publish | npm `@aws-sdk/lib-dynamodb-data-mapper` on preview channel after Preview 1 exit                                                                                     |
| GA definition   | API freeze + migration guide + perf CI gates + named AWS owner + support runbooks                                                                                   |


**Pre-T0 engineering:** Work starts from Phase 0 of this roadmap at T0. Any code already in `lib/lib-dynamodb-data-mapper/src` is an **internal spike only**. Do not treat it as a baseline, a demo of GA scope, or evidence that any phase deliverable is done.

---

## How to read ETAs

- **Duration** = engineering calendar time for that phase at default staffing.
- **ECD** = earliest completion date = **T0 + cumulative weeks** (includes prior phases).
- **GA window** = sum of phases + **4-week** program buffer (reviews, release train, slip).

Do **not** treat ECDs as commitments until T0 and FTE are approved.

---

## Phase summary


| Phase  | Name                                            | Duration | ECD (from T0) | Customer-visible milestone                    |
| ------ | ----------------------------------------------- | -------- | ------------- | --------------------------------------------- |
| 0      | Alignment & CI                                  | 2 wk     | 2 wk          | Scope sign-off, repo/Local CI wired           |
| 1      | **Preview 1**: core CRUD + primary query        | 6 wk     | 8 wk          | Installable preview, primary index only       |
| 2      | **Preview 2**: indexes, expressions, pagination | 8 wk     | 16 wk         | GSI/LSI query, builders, paged query          |
| 3      | **Preview 3**: scan, batch, transact            | 7 wk     | 23 wk         | Read breadth + write batching + transactions  |
| 4      | **Preview 4**: control plane & extensions       | 6 wk     | 29 wk         | Table lifecycle + locking/hooks/extensions    |
| 5      | **Preview 5**: schema depth & async             | 6 wk     | 35 wk         | Nested/document path, converters, async pages |
| 6      | **RC**: freeze, perf, migration                 | 4 wk     | 39 wk         | API freeze, perf gates, migration guide       |
| 7      | **GA**: ownership & support                     | 2 wk     | 41 wk         | Supported GA on `@aws-sdk/`* cadence          |
| Buffer | **Program buffer**                              | 4 wk     | **45 wk**     | Review slip, release train                    |


**Derived GA (default staffing):** **~10–11 months after T0** (45 weeks), not a fixed calendar month.

**Compressed track (3 FTE, parallel Phase 2/3 where safe):** **~32 weeks (~7.5 months)**. Requires explicit staffing approval.

**Stretch (1 FTE, heavy review churn):** add **+30–40%** to phases 2–5 → **~14–16 months**.

---

## Phase 0: Alignment & CI (2 weeks, ECD T0+2)


| #   | Delivery                                                                | ETA     |
| --- | ----------------------------------------------------------------------- | ------- |
| 0.1 | Deliverables ↔ phase mapping signed (this doc + `DataMapper_vs_ODM.md`) | T0+1 wk |
| 0.2 | SDK/DDB review owners, preview semver policy                            | T0+1 wk |
| 0.3 | DynamoDB Local integ in CI, publish pipeline stub                       | T0+2 wk |


**Exit:** Phase 1 work authorized. Net-new API changes require a change-board ticket and a paired update to `DataMapper_vs_ODM.md`.

---

## Phase 1: Preview 1: core mapper (6 weeks, ECD T0+8)


| #   | Matrix / feature                                 | ETA     |
| --- | ------------------------------------------------ | ------- |
| 1.1 | `defineSchema`, `forTable`, `DataMapper` factory | T0+2 wk |
| 1.2 | `put`, `get` (`undefined` if missing), `delete`  | T0+3 wk |
| 1.3 | `update` (SET-style partial)                     | T0+4 wk |
| 1.4 | Primary `query` (key condition, sort refinement) | T0+5 wk |
| 1.5 | Mapper validation error type (draft)             | T0+5 wk |
| 1.6 | Service error passthrough (document client)      | T0+5 wk |
| 1.7 | Unit + Local integration tests, preview npm tag  | T0+6 wk |
| 1.8 | Package in `aws-sdk-js-v3` monorepo, sync API    | T0+6 wk |
| 1.9 | Escape hatch = same `DynamoDBDocumentClient`     | T0+6 wk |


**Deferred to Phase 2+:** conditions on all paths, GSI, scan, batch, transact, table lifecycle, extensions.

**Exit:** Dogfoodable **Preview 1**: primary-index CRUD + query only.

---

## Phase 2: Preview 2: indexes, expressions, pagination (8 weeks, ECD T0+16)


| #    | Matrix / feature                                                                | ETA      |
| ---- | ------------------------------------------------------------------------------- | -------- |
| 2.1  | GSI/LSI declarations in schema, typed **query per index**                       | T0+10 wk |
| 2.2  | **Condition** builder (writes/reads)                                            | T0+11 wk |
| 2.3  | **Key** builder (query key conditions)                                          | T0+11 wk |
| 2.4  | **Update** builder (+ raw expression escape)                                    | T0+12 wk |
| 2.5  | **Projection** builder                                                          | T0+13 wk |
| 2.6  | Pagination: `limit`, `startKey`, `iteratePages()`, page metadata                | T0+14 wk |
| 2.7  | Query options: `filter`, `scanIndexForward`, read consistency                   | T0+14 wk |
| 2.8  | Schema-aware name mapping in builders                                           | T0+15 wk |
| 2.9  | `versionAttribute` optimistic locking                                           | T0+15 wk |
| 2.10 | `skipVersionCheck` per call                                                     | T0+15 wk |
| 2.11 | Optional **expressions** subpath export                                         | T0+16 wk |
| 2.12 | **Perf CI** baselines (put/query vs document client): start T0+12, gate by exit | T0+16 wk |


**Exit:** **Preview 2**: production-shaped reads/writes on primary + named indexes. Expression builders GA-quality for preview consumers.

---

## Phase 3: Preview 3: scan, batch, transact (7 weeks, ECD T0+23)


| #    | Matrix / feature                                        | ETA      |
| ---- | ------------------------------------------------------- | -------- |
| 3.1  | **Scan** on table handle                                | T0+18 wk |
| 3.2  | **Scan** on index handle                                | T0+19 wk |
| 3.3  | **Parallel scan** helper or scan options                | T0+20 wk |
| 3.4  | `AsyncIterable` on query/scan                           | T0+20 wk |
| 3.5  | **BatchGet** on handle + chunking/retry                 | T0+21 wk |
| 3.6  | **BatchWrite** on handle + chunking/retry               | T0+21 wk |
| 3.7  | Multi-table **batch** helper on `DataMapper`            | T0+22 wk |
| 3.8  | Per-table batch-get options                             | T0+22 wk |
| 3.9  | **TransactGet** / **TransactWrite** + ConditionCheck    | T0+23 wk |
| 3.10 | Multi-table transact helper                             | T0+23 wk |
| 3.11 | **Modular** batch/transact subpath (if split from core) | T0+23 wk |


**Exit:** **Preview 3**: parity with Java Enhanced on data-plane batch/transact/scan (minus control plane).

---

## Phase 4: Preview 4: control plane & extensions (6 weeks, ECD T0+29)


| #    | Matrix / feature                                             | ETA      |
| ---- | ------------------------------------------------------------ | -------- |
| 4.1  | **createTable** from schema (+ wait active)                  | T0+25 wk |
| 4.2  | **ensureTableExists** / **ensureTableNotExists**             | T0+25 wk |
| 4.3  | **deleteTable** (+ wait)                                     | T0+26 wk |
| 4.4  | GSI/LSI on create/update                                     | T0+26 wk |
| 4.5  | Create options: billing mode, SSE, streams                   | T0+27 wk |
| 4.6  | Extension SPI + ordered chain on `DataMapper` / table        | T0+27 wk |
| 4.7  | `beforePut` / lifecycle hooks                                | T0+28 wk |
| 4.8  | Auto UUID, auto timestamps, atomic counter extensions        | T0+28 wk |
| 4.9  | Write-if-not-exists via condition / update behavior metadata | T0+28 wk |
| 4.10 | `put`/`delete` with return values variants                   | T0+29 wk |
| 4.11 | Update modes aligned with Java (`onMissing`-style)           | T0+29 wk |
| 4.12 | Optional strict `ItemNotFoundError` on get                   | T0+29 wk |


**Exit:** **Preview 4**: table bootstrap + cross-cutting write extensions documented.

---

## Phase 5: Preview 5: schema depth, packaging, async (6 weeks, ECD T0+35)


| #    | Matrix / feature                                                              | ETA      |
| ---- | ----------------------------------------------------------------------------- | -------- |
| 5.1  | Per-attribute **converters**                                                  | T0+31 wk |
| 5.2  | Nested attributes + **document schema** path (preview)                        | T0+32 wk |
| 5.3  | Sets/maps/lists in schema (preview)                                           | T0+32 wk |
| 5.4  | Composable schema fragments                                                   | T0+33 wk |
| 5.5  | Auto-generated hash (UUID) schema flag + hook                                 | T0+33 wk |
| 5.6  | Immutable-friendly / records                                                  | T0+33 wk |
| 5.7  | Optional table name **prefix** on factory                                     | T0+34 wk |
| 5.8  | **Async** `PagePublisher`-style query/scan                                    | T0+34 wk |
| 5.9  | **Dynamic table name** per handle (if demand confirmed)                       | T0+35 wk |
| 5.10 | Core + expression/pagination/batch **subpath** packaging decision implemented | T0+35 wk |


**Exit:** **Preview 5**: schema feature set complete (nested attributes, document schema path, converters, sets/maps/lists, async pages, subpath packaging). Async path dogfoodable.

---

## Phase 6: RC (4 weeks, ECD T0+39)


| #   | Delivery                                                                 | ETA      |
| --- | ------------------------------------------------------------------------ | -------- |
| 6.1 | API freeze, semver policy for 1.x                                        | T0+37 wk |
| 6.2 | Migration guide (Labs DataMapper, Toolbox, raw document client)          | T0+38 wk |
| 6.3 | Error taxonomy frozen (mapper vs service)                                | T0+38 wk |
| 6.4 | Perf CI gates enforced on PR                                             | T0+39 wk |
| 6.5 | Public docs + samples aligned to this roadmap and `DataMapper_vs_ODM.md` | T0+39 wk |


**Exit:** Release candidate tagged. No breaking changes without major bump policy.

---

## Phase 7: GA (2 weeks, ECD T0+41) + buffer (4 weeks → T0+45)


| #      | Delivery                                    | ETA      |
| ------ | ------------------------------------------- | -------- |
| 7.1    | Named AWS owner + support runbooks          | T0+41 wk |
| 7.2    | GA npm on normal `@aws-sdk/`* release train | T0+41 wk |
| 7.3    | **Maintenance status** = active, supported  | T0+41 wk |
| Buffer | Program buffer (reviews, train slip)        | T0+45 wk |


**GA calendar example:** if **T0 = 1 July 2026**, default track GA ECD ≈ **mid-May 2027** (45 weeks). Adjust linearly from your real T0.

---

## GA estimate calculator

```
weeks_to_GA = sum(phase durations) + program_buffer
            = 2+6+8+7+6+6+4+2+4 = 45 weeks (default)

calendar_GA ≈ T0 + weeks_to_GA
```


| Staffing          | weeks_to_GA | Notes                                                                          |
| ----------------- | ----------- | ------------------------------------------------------------------------------ |
| 1.5 FTE (default) | **45**      | Above table                                                                    |
| 3 FTE parallel    | **~32**     | Overlap Phase 2 perf with Phase 1 tail, parallel batch/transact implementation |
| 1 FTE             | **~58–63**  | +30–40% on phases 2–5                                                          |


---

## Per-milestone checklist (rollup)

Use this as the **📋 delivery backlog**. Detail lives in phase tables above.

- **P1** Primary CRUD + query + preview publish  
- **P2** GSI/LSI query + Condition/Key/Update/Projection + pagination + version locking + perf CI  
- **P3** Scan + parallel scan + batch + transact (+ multi-table helpers)  
- **P4** Table lifecycle + extensions/hooks + return values + update modes  
- **P5** Converters + nested/document schema + async pages + packaging  
- **RC** Freeze + migration + docs + perf gates  
- **GA** Ownership + supported release

---

## Risks that move the calendar (not ETAs)


| Risk                                                               | Effect on GA                     |
| ------------------------------------------------------------------ | -------------------------------- |
| Scope creep (full Java parity + all preview schema features in P2) | +8–12 wk                         |
| AWS merge / review latency                                         | +4–8 wk (buffer partly covers)   |
| Smithy/codegen churn                                               | Rework in P2–P3                  |
| Preview API churn without semver discipline                        | Adopter cost, may force +2 wk RC |


---

## Review-set docs and their roles


| Doc                                  | Role                                                                                                |
| ------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `Proposal_v4_roadmap.md` (this file) | **When** the DataMapper ships: phased ETAs, per-phase deliverables, derived GA window               |
| `DataMapper_vs_ODM.md`               | **What** ships and **what shape** it takes: per-deliverable DataMapper API vs. hypothetical ODM API |


The two docs are intentionally redundant on the deliverable list (phase tables here, API shape there) so each can be read on its own. They are inconsistent if a deliverable exists in one and not the other; report it as a doc bug.