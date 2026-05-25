# Proposed DynamoDB DataMapper: delivery roadmap

**Purpose:** Replace a single fixed GA date with **phased milestones**, **per-phase ETAs in working days**, and a **derived total engineering effort to GA**.

**Scope in this doc:**

- **In scope:** every committed feature of `@aws-sdk/lib-dynamodb-data-mapper` core, grouped by preview phase, plus RC and GA.
- **Not in scope:** an ODM surface, dirty tracking by default, or any other optional layer. Those are deliberately kept off this schedule. See `[DataMapper_vs_ODM.md](./DataMapper_vs_ODM.md)` for what an ODM surface would look like and why it sits outside this program.

**Companion document for review:** `[DataMapper_vs_ODM.md](./DataMapper_vs_ODM.md)` lists every committed deliverable (DataMapper column) and its hypothetical ODM-shape counterpart. This roadmap is **when** those deliverables ship.

**Planning anchor:** **T0** = agreed engineering kickoff (preview program start). All ECDs below are **T0 + N working days of cumulative effort**.

**Unit:** All durations and ECDs are in **working days (wd) of engineering effort**. 1 working week = 5 wd. This roadmap does **not** project calendar dates. Calendar planning is downstream and depends on factors not modelled here.

**Assumptions (revisit when scope changes):**


| Assumption      | Default for estimates                                                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parallelism     | Phases are mostly **sequential**. Phase 2 perf CI can overlap late Phase 1                                                                                          |
| Scope contract  | **Java Enhanced parity** as defined by this roadmap and the DataMapper column of `DataMapper_vs_ODM.md`. Scope changes go through change board after Preview 2 exit |
| Preview publish | npm `@aws-sdk/lib-dynamodb-data-mapper` on preview channel after Preview 1 exit                                                                                     |
| GA definition   | API freeze + migration guide + perf CI gates + named AWS owner + support runbooks                                                                                   |


**Pre-T0 engineering:** Work starts from Phase 0 of this roadmap at T0. Any code already in `lib/lib-dynamodb-data-mapper/src` is an **internal spike only**. Do not treat it as a baseline, a demo of GA scope, or evidence that any phase deliverable is done.

---

## How to read ETAs

- **Duration** = engineering working-day effort for that phase.
- **ECD** = earliest completion date = **T0 + cumulative wd** (includes prior phases).
- **GA window** = sum of phase durations + **10 wd** program buffer (reviews, release train, slip).

Do **not** treat ECDs as commitments until T0 is approved.

---

## Phase summary


| Phase  | Name                                            | Duration | ECD (from T0) | Customer-visible milestone                    |
| ------ | ----------------------------------------------- | -------- | ------------- | --------------------------------------------- |
| 0      | Alignment & CI                                  | 5 wd     | 5 wd          | Scope sign-off, repo/Local CI wired           |
| 1      | **Preview 1**: core CRUD + primary query        | 15 wd    | 20 wd         | Installable preview, primary index only       |
| 2      | **Preview 2**: indexes, expressions, pagination | 22 wd    | 42 wd         | GSI/LSI query, builders, paged query          |
| 3      | **Preview 3**: scan, batch, transact            | 20 wd    | 62 wd         | Read breadth + write batching + transactions  |
| 4      | **Preview 4**: control plane & extensions       | 16 wd    | 78 wd         | Table lifecycle + locking/hooks/extensions    |
| 5      | **Preview 5**: schema depth & async             | 16 wd    | 94 wd         | Nested/document path, converters, async pages |
| 6      | **RC**: freeze, perf, migration                 | 10 wd    | 104 wd        | API freeze, perf gates, migration guide       |
| 7      | **GA**: ownership & support                     | 6 wd     | 110 wd        | Supported GA on `@aws-sdk/`* cadence          |
| Buffer | **Program buffer**                              | 10 wd    | **120 wd**    | Review slip, release train                    |


**Total engineering effort to GA:** **~120 wd** (sum of phase durations + 10 wd program buffer).

---

## Phase 0: Alignment & CI (5 wd, ECD T0+5 wd)


| #   | Delivery                                                                | ETA     |
| --- | ----------------------------------------------------------------------- | ------- |
| 0.1 | Deliverables ↔ phase mapping signed (this doc + `DataMapper_vs_ODM.md`) | T0+3 wd |
| 0.2 | SDK/DDB review owners, preview semver policy                            | T0+3 wd |
| 0.3 | DynamoDB Local integ in CI, publish pipeline stub                       | T0+5 wd |


**Exit:** Phase 1 work authorized. Net-new API changes require a change-board ticket and a paired update to `DataMapper_vs_ODM.md`.

---

## Phase 1: Preview 1: core mapper (15 wd, ECD T0+20 wd)


| #   | Delivery                                                                                                                       | ETA      |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | -------- |
| 1.1 | Describe a table's shape once and get a typed handle for working with it                                                       | T0+10 wd |
| 1.2 | Save, fetch, and delete a single record by its primary key                                                                     | T0+12 wd |
| 1.3 | Change selected fields of an existing record without rewriting the whole record                                                | T0+14 wd |
| 1.4 | List records that share the same primary key, with optional ordering and range refinement                                      | T0+16 wd |
| 1.5 | Clear, typed error when an item does not match the declared shape                                                              | T0+16 wd |
| 1.6 | DynamoDB service errors surface unchanged, so existing error handling keeps working                                            | T0+17 wd |
| 1.7 | Automated tests against a local DynamoDB and a first installable preview build on npm                                          | T0+20 wd |
| 1.8 | Library lives in the official AWS SDK for JavaScript repo and ships on the same release process                                | T0+20 wd |
| 1.9 | For anything the library does not cover, the underlying AWS DynamoDB client is still available alongside, with no extra wiring | T0+20 wd |


**Deferred to Phase 2+:** conditions on all paths, GSI, scan, batch, transact, table lifecycle, extensions.

**Exit:** Dogfoodable **Preview 1**: primary-index CRUD + query only.

---

## Phase 2: Preview 2: indexes, expressions, pagination (22 wd, ECD T0+42 wd)


| #    | Delivery                                                                                                                                                           | ETA      |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| 2.1  | Declare secondary indexes (alternative ways to look up the same records) in the schema and query each by name                                                      | T0+25 wd |
| 2.2  | Express conditions such as "only update this record if the status is still pending" using a typed builder, not hand-written DynamoDB strings                       | T0+28 wd |
| 2.3  | Express key lookup criteria (equals, greater than, between, begins-with) using a typed builder                                                                     | T0+28 wd |
| 2.4  | Express update operations (set, add, remove, append to a list) using a typed builder, with an escape hatch for unusual cases                                       | T0+32 wd |
| 2.5  | Choose exactly which fields to read back from DynamoDB, to keep payloads small and costs down                                                                      | T0+34 wd |
| 2.6  | Walk through large result sets in chunks, with a "next page" cursor and per-page information                                                                       | T0+37 wd |
| 2.7  | Common query knobs: post-fetch filtering, sort direction, strongly-consistent reads                                                                                | T0+37 wd |
| 2.8  | Builders automatically translate the field names from the schema into the names DynamoDB expects                                                                   | T0+39 wd |
| 2.9  | Mark one field as a version counter so concurrent writers cannot silently overwrite each other                                                                     | T0+39 wd |
| 2.10 | Bypass the version check on a specific call when the caller is intentionally forcing a write                                                                       | T0+39 wd |
| 2.11 | Expose the expression builders as a separate, optional import for users who only want that piece                                                                   | T0+42 wd |
| 2.12 | Performance benchmarks (save and query) run on every change, compared against the bare AWS client, with thresholds that block performance regressions from merging | T0+42 wd |


**Exit:** **Preview 2**: production-shaped reads/writes on primary + named indexes. Expression builders GA-quality for preview consumers.

---

## Phase 3: Preview 3: scan, batch, transact (20 wd, ECD T0+62 wd)


| #    | Delivery                                                                                                                                                       | ETA      |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 3.1  | Read every record in a table (full table sweep), returned with the same typed shape as a normal query                                                          | T0+48 wd |
| 3.2  | Read every record through a secondary index                                                                                                                    | T0+50 wd |
| 3.3  | Split a full table sweep across several workers, for faster large reads                                                                                        | T0+53 wd |
| 3.4  | Iterate over query and scan results page by page using standard for-await loops, instead of manual paging                                                      | T0+53 wd |
| 3.5  | Fetch many records in a single call; the library automatically splits the request into the chunk sizes DynamoDB accepts and retries partial failures           | T0+56 wd |
| 3.6  | Save or delete many records in a single call, with the same automatic chunking and retry                                                                       | T0+56 wd |
| 3.7  | One call that batches across several tables at once                                                                                                            | T0+58 wd |
| 3.8  | Per-table options (such as which fields to read back, or strong consistency) when fetching across multiple tables                                              | T0+58 wd |
| 3.9  | Read or write a group of items as a single all-or-nothing transaction, including "only proceed if this condition still holds on a related record" cross-checks | T0+62 wd |
| 3.10 | One call that runs a transaction spanning multiple tables                                                                                                      | T0+62 wd |
| 3.11 | Optionally publish the batch and transaction code as a separate import for users who only want that piece                                                      | T0+62 wd |


**Exit:** **Preview 3**: parity with Java Enhanced on data-plane batch/transact/scan (minus control plane).

---

## Phase 4: Preview 4: control plane & extensions (16 wd, ECD T0+78 wd)


| #    | Delivery                                                                                                                                                  | ETA      |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 4.1  | Create the DynamoDB table directly from the schema, and wait until it is ready to accept traffic                                                          | T0+66 wd |
| 4.2  | "Make sure this table exists" and "make sure this table is gone" helpers, safe to call repeatedly (handy for tests and local development)                 | T0+66 wd |
| 4.3  | Delete a table and wait until the deletion is complete                                                                                                    | T0+68 wd |
| 4.4  | Declare or add secondary indexes when creating or updating the table                                                                                      | T0+68 wd |
| 4.5  | Configure on-demand vs provisioned billing, server-side encryption, and change streams at table creation                                                  | T0+71 wd |
| 4.6  | Plug-in mechanism that lets users insert their own logic before and after every read and write, running in a defined order                                | T0+72 wd |
| 4.7  | Hook into specific moments (such as "right before a save") to inject custom behaviour, like enrichment or validation                                      | T0+74 wd |
| 4.8  | Built-in helpers that ship in the box: auto-fill an ID field, auto-fill created-at / updated-at timestamps, and atomic counter increments                 | T0+74 wd |
| 4.9  | Save a record only if it does not already exist, plus declarative rules in the schema for how updates should treat missing fields                         | T0+74 wd |
| 4.10 | Save and delete can optionally return the previous version of the record (useful for audit, undo, or change-data-capture)                                 | T0+78 wd |
| 4.11 | Configurable rules for what happens when an update targets a field that is not yet set, matching the Java SDK's behaviour for teams that work across both | T0+78 wd |
| 4.12 | Opt-in strict mode where fetching a non-existent record throws a typed error instead of returning "not found"                                             | T0+78 wd |


**Exit:** **Preview 4**: table bootstrap + cross-cutting write extensions documented.

---

## Phase 5: Preview 5: schema depth, packaging, async (16 wd, ECD T0+94 wd)


| #    | Delivery                                                                                                                                                       | ETA      |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 5.1  | Custom rules for storing and loading individual fields (for example, encrypted strings, custom date formats, money amounts as integers)                        | T0+82 wd |
| 5.2  | Describe records that contain nested objects (a user with an address, an order with line items) directly in the schema                                         | T0+85 wd |
| 5.3  | First-class support for DynamoDB's set, map, and list field types in the schema                                                                                | T0+85 wd |
| 5.4  | Build large schemas by combining smaller reusable schema pieces, instead of repeating the same field declarations                                              | T0+88 wd |
| 5.5  | One-line opt-in for "this primary key should be auto-generated for new records," plus a hook to plug in a custom ID generator                                  | T0+88 wd |
| 5.6  | Works cleanly with immutable data styles (frozen objects, record types), without forcing the caller into a mutable coding pattern                              | T0+88 wd |
| 5.7  | Add an environment prefix (dev-, staging-, sandbox-) to every table name automatically, so application code does not have to know the environment              | T0+91 wd |
| 5.8  | Streaming-style results for query and scan, for users who prefer a publisher API over standard iteration                                                       | T0+91 wd |
| 5.9  | Resolve the table name at runtime (such as a per-tenant table) instead of fixing it at application startup, if real demand for this is confirmed during review | T0+94 wd |
| 5.10 | Finalise how the library is split into installable pieces, so users can pick only the parts they need and keep their bundle size small                         | T0+94 wd |


**Exit:** **Preview 5**: schema feature set complete (nested attributes, document schema path, converters, sets/maps/lists, async pages, subpath packaging). Async path dogfoodable.

---

## Phase 6: RC (10 wd, ECD T0+104 wd)


| #   | Delivery                                                                 | ETA       |
| --- | ------------------------------------------------------------------------ | --------- |
| 6.1 | API freeze, semver policy for 1.x                                        | T0+98 wd  |
| 6.2 | Migration guide (Labs DataMapper, Toolbox, raw document client)          | T0+101 wd |
| 6.3 | Error taxonomy frozen (mapper vs service)                                | T0+101 wd |
| 6.4 | Perf CI gates enforced on PR                                             | T0+104 wd |
| 6.5 | Public docs + samples aligned to this roadmap and `DataMapper_vs_ODM.md` | T0+104 wd |


**Exit:** Release candidate tagged. No breaking changes without major bump policy.

---

## Phase 7: GA (6 wd, ECD T0+110 wd) + buffer (10 wd → T0+120 wd)


| #      | Delivery                                    | ETA       |
| ------ | ------------------------------------------- | --------- |
| 7.1    | Named AWS owner + support runbooks          | T0+110 wd |
| 7.2    | GA npm on normal `@aws-sdk/`* release train | T0+110 wd |
| 7.3    | **Maintenance status** = active, supported  | T0+110 wd |
| Buffer | Program buffer (reviews, train slip)        | T0+120 wd |


---

## GA effort calculator

```
effort_to_GA = sum(phase durations) + program_buffer
             = 5 + 15 + 22 + 20 + 16 + 16 + 10 + 6 + 10
             = 120 wd
```

Calendar translation (T0 + ?) is **out of scope** for this roadmap. It depends on staffing and parallelism decisions made by program management.

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

## Risks that move the GA effort total (not per-phase ETAs)


| Risk                                                               | Effect on GA                     |
| ------------------------------------------------------------------ | -------------------------------- |
| Scope creep (full Java parity + all preview schema features in P2) | +20–30 wd                        |
| AWS merge / review latency                                         | +10–20 wd (buffer partly covers) |
| Smithy/codegen churn                                               | Rework in P2–P3                  |
| Preview API churn without semver discipline                        | Adopter cost, may force +5 wd RC |


---

## Review-set docs and their roles


| Doc                                  | Role                                                                                                  |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `Proposal_v4_roadmap.md` (this file) | **Effort** to ship the DataMapper: phased ETAs in wd, per-phase deliverables, derived GA effort total |
| `DataMapper_vs_ODM.md`               | **What** ships and **what shape** it takes: per-deliverable DataMapper API vs. hypothetical ODM API   |


The two docs are intentionally redundant on the deliverable list (phase tables here, API shape there) so each can be read on its own. They are inconsistent if a deliverable exists in one and not the other; report it as a doc bug.