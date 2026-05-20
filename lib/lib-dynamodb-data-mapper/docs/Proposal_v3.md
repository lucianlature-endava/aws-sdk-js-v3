# First-party DynamoDB Data Mapper for AWS SDK JavaScript v3

**Author:** Endava Team  
**For:** DynamoDB and AWS SDK for JavaScript leadership  
**Document phase:** High-level design (first presentation). Technical detail is in the [Appendix](#appendix) and is excluded from the page count.

**Owners**: Lucian Lature / Endava Team

**Primary reviewers**: DDB Service Team

**Secondary reviewers**: AWS SDK Team

This document is a high-level design for a first-party **Data Mapper** on AWS SDK for JavaScript v3: a schema-driven layer that maps persistence-ignorant domain types to DynamoDB items while keeping **PK/SK, indexes, and access patterns explicit**. It is the supported successor to the archived Labs `@aws/dynamodb-data-mapper`. We **do not** recommend shipping a separate document-centric **ODM** product (Dynamoose-style models with embedded aggregates and hidden single-table layout) on the official stack. Evidence, API sketches, benchmarks, and delivery detail are in the [Appendix](#appendix).

## Executive summary and decision

**In one line:** we recommend funding and shipping `@aws-sdk/lib-dynamodb-data-mapper` on the v3 modular line as the official **Data Mapper**, not a phased “mapper now, ODM later” program, with implementation starting **1 June 2026** and general availability targeted for **30 September 2026** ([Timeline](#timeline-illustrative)).

**Decision requested:** approve engineering and product commitment for that package: named AWS ownership after GA, support on par with other `@aws-sdk/`* libraries, and delivery through preview, API freeze, and GA on the v3 stack (`DynamoDBDocumentClient` underneath and the escape hatch unchanged).

**What we ship:** schema-first typed **get, put, update, delete, and query** (partition-scoped **Query** on the base table and named GSI/LSI, not **Scan**). **One table per** `forTable` handle (no multi-table registry or cross-table orchestration in v1). Helpers for **Key, Condition, and Update** expressions, pagination, and batch/transact chunking. Schema-driven **optimistic locking** and optional **lifecycle hooks**. Mapper validation errors are separate from DynamoDB service errors. Application types stay persistence-ignorant with explicit keys and indexes. No DynamoDB service API changes.

**Why Data Mapper, not document-ODM:** DynamoDB is key-value first. Mis-modeling is the bigger risk than SDK boilerplate. We recommend a Dynamo-centric **Data Mapper** (explicit keys and layout), not a document-ODM that “Mongo-ifies” the service ([Recommendation](#recommendation-data-mapper-not-document-odm)). Other languages already ship their own elevated clients. **This HLD covers JavaScript only.**

---

## Scope of this HLD

This document defines **one deliverable**: `@aws-sdk/lib-dynamodb-data-mapper` (final name TBD) for TypeScript and JavaScript on `@aws-sdk/lib-dynamodb`. It specifies version 1 scope, design tenets, delivery phases, and review answers.

Success for this HLD means: package GA on npm under `@aws-sdk/`*, documentation and examples that teach **Data Mapper** usage on DynamoDB, performance and API gates met, and a clear line against positioning the product as a Mongo-style ODM.



## Recommendation: Data Mapper, not document-ODM

Two orthogonal ideas often get conflated:


| Axis                              | What it means                                                                                                                                                                                                                                                           |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pattern (coupling)**            | **Data Mapper:** domain objects are persistence-ignorant. A separate mapper/repository layer translates to and from the store. **Active Record / model-centric:** persistence methods live on the model (`OrderModel.get`, `doc.save`).                                 |
| **Modeling (Dynamo vs document)** | **Dynamo-centric mapper:** you design PK/SK, GSIs, and item types. The library marshals and types commands. **Document-centric ODM:** you define a schema as one item with nested fields. The library may hide how that maps to partitions and multiple physical items. |


### Why a Data Mapper, not an ODM

DynamoDB is **key-value first, document second**. Its document story is essentially that a value can be a JSON-like blob and the service offers projection APIs. The primary abstraction is partition and sort keys, and item collections within a partition.

**ODM** abstractions are database-agnostic document metaphors. They were designed for systems where one document equals one aggregate (MongoDB, DocumentDB). They are a poor default for single-table, multi-entity layouts keyed by access patterns.

With DynamoDB, the main risk is **mis-modeling**, not syntax verbosity. AWS and community guidance stress single-table design and access patterns. The costliest failures usually come from applying relational or document-database habits, not from hand-writing a bit of SDK code.

Therefore a **Data Mapper** (Labs DataMapper, DynamoDB Toolbox, this proposal) that keeps keys and physical layout explicit is a better fit than an ODM that tries to “Mongo-ify” DynamoDB. **We recommend that pattern with Dynamo-centric modeling** for the first-party package: the same product category as the archived Labs DataMapper and the direction implied by the Java Enhanced Client (typed mapping over the service API, not a document store pretending to be MongoDB).

### Single-table example: why the choice matters

Shared domain: `Order` with `OrderItem[]` in table `app`.

**Data Mapper (what we propose):** `Order` / `OrderItem` stay domain-only. Persistence uses `OrderMetaRecord` and `OrderItemRecord` (or equivalent schema rows) with `PK = ORDER#<orderId>`, `SK = META` vs `SK = ITEM#<lineNumber>`, and GSI keys for customer listing. `save` writes META plus N item rows. `getById` queries the partition and reassembles the aggregate. Single-table design stays **visible** in code.

**Document-ODM (what we do not propose):** `OrderModel` with hash key `id` and nested `items[]`. `OrderModel.get(id)` and `doc.save()`. Ergonomic for Mongo-shaped mental models. It does **not** naturally express “one aggregate, multiple item types, same PK”. Teams either denormalize into one fat item or fight the library.

> In the Data Mapper version, the code makes single-table design explicit: `Order` maps to META + ITEM#n rows sharing a PK. In the document-ODM version, DynamoDB is treated as a document collection and composite key discipline is easy to lose.

Community libraries remain valid where teams want stronger opinions ([Appendix H](#appendix-h)). AWS documentation should describe this package as the **official Data Mapper** on `@aws-sdk/`*, not as a Dynamoose replacement.

---

## Problem

Teams cannot define an item shape once and reuse it safely across reads and writes in an AWS-supported way. That leads to repeated boilerplate, expression mistakes, and inconsistent patterns between services.

The Labs DataMapper was archived and never replaced on the **v3** line. That is a succession gap, not evidence that mapping failed: the SDK team has reported that customers who used DataMapper on **v2 were satisfied** with it. Without a supported v3 successor, teams stay on legacy `aws-sdk` v2, adopt community libraries, or build internal wrappers. Roughly one in four `lib-dynamodb` installs also pull in a higher-level wrapper ([Appendix G](#appendix-g)). The archived package still sees substantial npm traffic ([Appendix G](#appendix-g), [Appendix E](#appendix-e), directional).

A single hand-built `UpdateCommand` on the document client is fine. At scale, copy-paste and subtle key or expression bugs add up. Only a first-party package can become the consistent, supported standard customers expect from AWS.

---

## Tenets

The package is additive. It sits on the stack customers already use, adoption is opt-in, and teams can drop down to `DynamoDBDocumentClient` or `@aws-sdk/client-dynamodb` at any time.

Schemas are plain code: `defineSchema({ attributes, indexes })` with strong TypeScript inference. Decorators are not required (see [Appendix F](#appendix-f)).

Security and operations match the document client: same credentials, IAM, and logging posture, with no payloads or secrets in default logs.

Version 1 is a **Data Mapper**: persistence-ignorant domain types, explicit keys and indexes in schema, thin translation to `DynamoDBDocumentClient` commands. It is not a document-ODM (no model-centric `save`/`get` surface, no default “one nested document per aggregate”). Version 1 does not prescribe single-table frameworks, create tables from application code, or bundle DAX.

The design is modular: a core mapper plus optional pieces for expressions, pagination, and batch or transactional utilities.

Mapper validation errors are reported separately from DynamoDB service errors such as throttling or conditional check failures.

---

## What we are launching

We propose `@aws-sdk/lib-dynamodb-data-mapper` (final name TBD), built on `DynamoDBDocumentClient`.

Developers define a schema and bind **one DynamoDB table** with `DataMapper.forTable(tableName, schema, { client })`. Each handle provides typed **get, put, update, delete, and query** mapped to the application row shape defined in that schema. **Query** means key-condition access on the primary index or on a GSI/LSI when the caller supplies `IndexName` and a typed key condition. **Scan** is not part of the mapper surface in v1 (use `DynamoDBDocumentClient.send(new ScanCommand(...))` via the escape hatch). **Multi-table** workloads use multiple handles or the document client directly. v1 does not ship an entity registry, relationship graph, or cross-table unit of work.

**Schema-driven write/read behaviour (v1 intent):**


| Capability                                              | What it means in v1                                                                                                                                                                                                                                                    |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Optimistic locking**                                  | A numeric attribute marked `versionAttribute: true` on the schema drives conditional updates/deletes (mapper maps to DynamoDB condition expressions).                                                                                                                  |
| **Lifecycle hooks**                                     | Optional callbacks on write paths (for example `beforePut`) to validate or adjust the row before marshalling, **not** change tracking or implicit dirty-state saves.                                                                                                   |
| **Update behaviour**                                    | Explicit partial updates (SET / ADD / REMOVE style) via the table handle and Update-expression helpers. No hidden full-item replace unless the caller chooses it.                                                                                                      |
| **Atomic counters, auto timestamps, custom converters** | Under design for preview/GA where they fit the schema model (for example increment-on-write, `createdAt`/`updatedAt` defaults, custom attribute ↔ stored-type mapping). Exact API is not frozen in this HLD. They are not required for the first private preview gate. |


**Expression helpers:** DynamoDB uses four expression families, **Key** (query key conditions), **Condition** (conditional puts/updates/deletes), **Update** (partial item updates), and **Projection** (subset of attributes on reads). v1 targets typed builders for **Key, Condition, and Update** (see modular helpers in [Appendix C](#appendix-c)). **Projection** stays caller-driven or document-client-native in v1 unless preview feedback prioritizes a typed projection builder.

**Also in the package:** pagination over `LastEvaluatedKey`, and utilities that chunk batch writes and transactions to service limits. Helpers can be imported with or without the table handle.

Customers gain one documented AWS path on the official stack. Adoption is incremental: pin a version, mix mapper calls with raw `send(Command)` on the same client, or stop importing to roll back.

The happy path: configure `DynamoDBDocumentClient` as today → `defineSchema` → `forTable` → typed CRUD/query. [Appendix C](#appendix-c) walks through a full example. [Appendix F](#appendix-f) maps concepts to the Java Enhanced Client.

Early PutItem benchmarks ([Appendix: PoC micro-benchmark](#appendix-poc)) show the raw document client fastest, Toolbox and ElectroDB within roughly 2–8% median overhead, and Dynamoose higher. We intend to keep mapper overhead close to the document-client path and to establish CI baselines before we publish numeric targets. Community-library comparison and coexistence notes are in [Appendix H](#appendix-h) and [Appendix K](#appendix-k), not part of the v1 deliverable itself.

---

## Design decisions (summary)

The table below records the main choices. Wording is intentional for review. Details sit in the [appendix](#appendix).


| Decision         | Choice                                                         | Comments                                                                                                                                                             |
| ---------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Delivery         | Additive package, not inside `lib-dynamodb` or codegen         | Tradeoff: we own another package, but previews can move quickly and the escape hatch stays obvious                                                                   |
| Modeling         | Schema-first primary experience                                | Tradeoff: a small upfront schema cost reduces long-term drift                                                                                                        |
| Adoption shape   | Core mapper plus separate helper modules                       | Tradeoff: more surfaces to version, but teams can adopt piece by piece                                                                                               |
| Product shape    | Data Mapper (Dynamo-centric), not document-ODM                 | Aligns with Labs DataMapper and single-table/access-pattern design. Rejects Dynamoose-style default ([Recommendation](#recommendation-data-mapper-not-document-odm)) |
| Deferred scope   | Auto-GSI routing, decorators-first, DAX, table-from-code       | Out of v1 scope. May be reconsidered only with evidence after GA, not as a separate “ODM phase”                                                                      |
| Expressions      | Key, Condition, and Update builders in v1. Projection deferred | Matches Query/conditional writes/partial updates. Projection via escape hatch unless preview prioritizes it                                                          |
| Indexes          | Caller supplies `IndexName` and key condition                  | Keeps cost and correctness visible to the developer                                                                                                                  |
| Schema evolution | Forward-compatible reads by default, strict modes optional     | Safer reads. Migration tooling specified before API freeze                                                                                                           |
| Versioning       | Same semver rules as other `@aws-sdk/`* packages               | Preview channels and deprecation notices manage churn                                                                                                                |


[Appendix K](#appendix-k) ranks building greenfield versus adopting a community library. Greenfield is the default for API control and release clarity. Adopting a library such as Toolbox is worth discussion only if leadership prioritizes time to first preview.

---

## V1 scope

Version 1 is a schema-first API. Attributes are scalar-first in v1. Sets, maps, and nested shapes can deepen during preview ([Appendix F](#appendix-f) and [Appendix B](#appendix-b)).

**In scope**

- **Per-table handle:** `defineSchema` + `DataMapper.forTable` for a single `tableName`. multiple tables ⇒ multiple handles (no v1 multi-table registry).
- **Operations:** typed get, put, update, delete. **Query** with partition equality (and sort-key conditions when modeled) on the base table. **Query** on GSI/LSI with explicit `IndexName` and typed **Key** condition. No mapper **Scan** API.
- **Expressions:** builders/helpers for **Key**, **Condition**, and **Update** expressions. **Projection** not committed in v1 unless added during preview.
- **Schema behaviour:** `versionAttribute` optimistic locking. optional lifecycle hooks (e.g. `beforePut`). explicit partial update paths.
- **Modular helpers:** pagination (`LastEvaluatedKey`), batch/transact chunking (usable with or without the table handle).
- **Errors:** mapper validation errors distinct from DynamoDB service errors (frozen at API freeze).

**Preview/GA candidates (API TBD):** atomic counters, autogenerated timestamps, custom attribute converters, aligned with schema metadata, not a separate ORM layer.

**Escape hatch (always):** `Scan`, `TransactWriteItems`/`BatchWriteItem` with arbitrary items, TTL, and cross-table orchestration via the same `DynamoDBDocumentClient` instance.

**Out of scope for v1:** automatic GSI routing, prescribed single-table frameworks, table creation from code, DAX bundling, decorator-first API, Labs shim, document-ODM model APIs, change tracking, streams mapping, and multi-table relationship fix-up. This HLD commits to **one** Data Mapper shape at GA.

API illustrations are in [Appendix A](#appendix-a) through [Appendix C](#appendix-c).

---

## High-level design

```
Application  →  @aws-sdk/lib-dynamodb-data-mapper  →  @aws-sdk/lib-dynamodb  →  @aws-sdk/client-dynamodb  →  DynamoDB
```

Credentials, retries, middleware, and marshalling stay on the existing stack. The mapper adds schema mapping and helpers only (full diagram in [Appendix A](#appendix-a)).

On each request the mapper validates and maps the application object, marshals it the same way the document client would, calls `send(Command)`, and on reads unmarshals back to the row shape. [Appendix C](#appendix-c) shows a worked example.

Telemetry remains the caller’s responsibility. The mapper can expose hooks for injection but does not require a particular observability vendor.

We will measure bundle size, import cost, and per-request overhead in CI. Hot paths may bypass the mapper when teams need bare-metal performance.

---

## Shipping dependencies and impact

We will publish on npm under `@aws-sdk/`* using the same build and TypeScript pipeline as the generated clients. After general availability, a named AWS owner takes long-term ownership. Endava executes through GA per the stakeholder agreement. Legal, security, and SDK reviews run before a broad preview.

There are no DynamoDB service API changes. All work is client-side. Security and IAM guidance inherit from the document client model, with clear examples in documentation. Testing includes unit and integration tests (for example against DynamoDB Local) and performance regression checks in CI once baselines exist. The document client, low-level client, and existing community libraries remain unchanged for teams that prefer them.

---



## Timeline (illustrative)

**Program start:** **1 June 2026** (implementation and Phase 0). **GA target:** **30 September 2026**. Dates below are planning ECDs from that anchor. Formal go/no-go gates may shift individual milestones. Surface-to-phase mapping and risks are in [Appendix: Program plan](#appendix-program-plan) and [Appendix J](#appendix-j).


| Phase  | What we build (technical)                                                                                                                                            | Duration (weeks) | ECD        |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ---------- |
| 0      | API sketch sign-off, v1 scope contract, SDK/DDB review owners, repo/CI wiring                                                                                        | 2                | 14 Jun '26 |
| 1      | **Private preview:** core package (`defineSchema`, `forTable`), primary-key put/get/update/delete/query, unit + Local integration tests, installable preview publish | 5                | 19 Jul '26 |
| 2      | **Perf CI:** PutItem/query baselines vs document client, regression gates in CI                                                                                      | 3                | 9 Aug '26  |
| 3      | **Wider preview:** expression/condition builders, pagination, batch/transact chunking, explicit GSI/LSI query, docs + samples                                        | 4                | 6 Sep '26  |
| 4      | **Release candidate:** API freeze, migration guide from Labs DataMapper / community libs, error taxonomy frozen (overlaps late Phase 3 where possible)               | 2                | 20 Sep '26 |
| Buffer | Calendar buffer (release train, review slip)                                                                                                                         | 1                | 27 Sep '26 |
| 5      | **General availability:** named AWS owner, support runbooks, semver on normal `@aws-sdk/`* cadence                                                                   | 1                | 30 Sep '26 |


**17 weeks** from **1 June** to **30 September**. RC may run in parallel with late preview work. Between private preview and GA, most calendar time is hardening, documentation, perf gates, and review, not net-new surface area.

---



## Appendix

*(Supporting material, not counted toward proposal page limit.)*

**Contents:** [A](#appendix-a) · [B](#appendix-b) · [C](#appendix-c) · [D](#appendix-d) · [E](#appendix-e) · [F](#appendix-f) · [G](#appendix-g) · [H](#appendix-h) · [J](#appendix-j) · [K](#appendix-k) · [PoC](#appendix-poc) · [Program plan](#appendix-program-plan)



### A. Architecture (illustrative)

The mapper sits above the document client. The generated clients stay unchanged. the mapper wraps them in place and keeps a single source of generated code. The mapper layer is modular: it comprises a core DataMapper package plus expression and condition builders, pagination helpers, and batch and transaction utilities (separate npm packages, stable subpath exports under one umbrella, or both, to be decided at implementation stage). The diagram shows those four surfaces explicitly.

```
┌──────────────────────────────────────────────────────────┐
│            Application Code (TypeScript)                 │
└───────────────────────────┬──────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────┐
│       @aws-sdk/lib-dynamodb-data-mapper                  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Core DataMapper                                    │  │
│  │ defineSchema · tables · typed CRUD/query · hooks · │  │
│  │ optimistic locking · typed errors                  │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Expression & condition builders                    │  │
│  │ safe conditions · updates · filters                │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Pagination helpers                                 │  │
│  │ query/scan pages · LastEvaluatedKey · iteration    │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Batch & transaction utilities                      │  │
│  │ chunking · retries · transact limits               │  │
│  └────────────────────────────────────────────────────┘  │
└───────────────────────────┬──────────────────────────────┘
                            │ wraps (extends in place)
┌───────────────────────────▼──────────────────────────────┐
│              @aws-sdk/lib-dynamodb                       │
│        DynamoDBDocumentClient (auto-marshall)            │
└───────────────────────────┬──────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────┐
│             @aws-sdk/client-dynamodb                     │
│   Low-level client · Smithy middleware                   │
└───────────────────────────┬──────────────────────────────┘
                            │
                       AWS DynamoDB
```

For a full, end-to-end typed example (schema definition plus put, get, update, delete, and query), see [Appendix C](#appendix-c) (Core mapper).



### B. Typings (illustrative)

The following declaration sketch matches the attributes + indexes shape used in [Appendix C](#appendix-c) (Core mapper) (same separation as ElectroDB’s schema model). Attributes hold business fields only. indexes.primary maps DynamoDB pk / sk attribute names to composite attribute names. SchemaFields is inferred from attributes. RowSchema is that row type. KeyInput is inferred from the primary index composites. This appendix is incomplete on purpose: a shipping package would add GSIs, overloads, and stricter update / query key shapes. `const` on the schema parameter assumes a modern TypeScript version that preserves literal field types.

```typescript
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

type DynamoScalar = "string" | "number" | "boolean" | "binary";

interface FieldDef<T extends DynamoScalar, K extends string | undefined = undefined> {
  type: T;
  key?: K;
  versionAttribute?: boolean;
}

type InferAttrType<T extends DynamoScalar> = T extends "string"
  ? string
  : T extends "number"
    ? number
    : T extends "boolean"
      ? boolean
      : Uint8Array;

type SchemaFields<A extends Record<string, FieldDef<DynamoScalar, any>>> = {
  [K in keyof A]: A[K] extends FieldDef<infer T, any> ? InferAttrType<T> : never;
};

type PrimaryIndex = {
  pk: { field: string; composite: readonly string[] };
  sk: { field: string; composite: readonly string[] };
};

type SchemaWithPrimaryIndex = {
  attributes: Record<string, FieldDef<DynamoScalar, undefined>>;
  indexes: { primary: PrimaryIndex };
};

declare function defineSchema<const S extends SchemaWithPrimaryIndex>(schema: S): S;

type RowSchema<S extends SchemaWithPrimaryIndex> = SchemaFields<S["attributes"]>;

type KeyInput<S extends SchemaWithPrimaryIndex> = Pick<
  RowSchema<S>,
  | S["indexes"]["primary"]["pk"]["composite"][number]
  | S["indexes"]["primary"]["sk"]["composite"][number]
>;

interface ForTableOptions {
  client: DynamoDBDocumentClient;
}

type HookName = "beforePut";

interface TableHandle<S extends SchemaWithPrimaryIndex> {
  put(item: RowSchema<S>): Promise<void>;
  get(key: KeyInput<S>): Promise<RowSchema<S> | undefined>;
  delete(key: KeyInput<S>): Promise<void>;
  query(
    key: Pick<RowSchema<S>, S["indexes"]["primary"]["pk"]["composite"][number]> &
      Partial<Pick<RowSchema<S>, S["indexes"]["primary"]["sk"]["composite"][number]>>
  ): AsyncIterable<RowSchema<S>>;
  update(
    partitionKey: RowSchema<S>[S["indexes"]["primary"]["pk"]["composite"][0]],
    patch: { set: Partial<RowSchema<S>> }
  ): UpdateBuilder<S>;
  on<E extends HookName>(
    event: E,
    handler: E extends "beforePut" ? (item: RowSchema<S>) => void : never
  ): void;
}

interface UpdateBuilder<S extends SchemaWithPrimaryIndex> {
  condition(expr: ConditionExpr<S>): this;
  execute(): Promise<void>;
}

type ConditionExpr<S extends SchemaWithPrimaryIndex> = (api: { attr: AttrApi<S> }) => unknown;

type AttrApi<S extends SchemaWithPrimaryIndex> = {
  [K in keyof RowSchema<S>]: {
    exists(): unknown;
  };
};

declare function attr(name: string): { exists(): unknown };

declare const DataMapper: {
  forTable<S extends SchemaWithPrimaryIndex>(
    tableName: string,
    schema: S,
    options: ForTableOptions
  ): TableHandle<S>;
};
```



### C. API surface (illustrative)

The following sketches illustrate style only. names, paths, and signatures may differ at ship time. Part one focuses on the core mapper (`defineSchema`, `DataMapper.forTable`, typed table operations). Part two shows how modular helpers might appear as separate imports (subpackages or stable subpath exports under one umbrella) for teams that want building blocks without adopting the full table abstraction.

**Core mapper**

```typescript
const UserSchema = defineSchema({
  attributes: {
    userId: { type: "string" },
    profileKey: { type: "string" },
    name: { type: "string" },
    email: { type: "string" },
    version: { type: "number", versionAttribute: true },
  },
  indexes: {
    primary: {
      pk: { field: "pk", composite: ["userId"] },
      sk: { field: "sk", composite: ["profileKey"] },
    },
  },
});

const UserTable = DataMapper.forTable("UserTable", UserSchema, { client });

await UserTable.put({
  userId: "user#123",
  profileKey: "profile",
  name: "Alice",
  email: "alice@example.com",
  version: 1,
});

const user = await UserTable.get({ userId: "user#123", profileKey: "profile" });

await UserTable.update("user#123", { set: { name: "Bob" } })
  .condition((api) => api.attr("email").exists())
  .execute();

await UserTable.delete({ userId: "user#123", profileKey: "profile" });

for await (const item of UserTable.query({ userId: "user#123" })) {
  // item: { userId, profileKey, name, email, version }
}

UserTable.on("beforePut", (item) => {
  if (!item.email) throw new Error("email required");
});
```

**Modular helpers**

```typescript
import { QueryCommand } from "@aws-sdk/client-dynamodb";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { buildKeyCondition, buildUpdateParts } from "@aws-sdk/lib-dynamodb-data-mapper/expressions";
import { pagesOfQuery } from "@aws-sdk/lib-dynamodb-data-mapper/pagination";
import { transactWriteChunks } from "@aws-sdk/lib-dynamodb-data-mapper/batch";

const { keyCondition, exprNames, exprValues } = buildKeyCondition((b) =>
  b.partition("pk").eq("user#123")
);

const updateParts = buildUpdateParts((u) => u.set("name", "Bob").ifVersion("version", 3));

for await (const page of pagesOfQuery(docClient, { TableName: "UserTable" })) {
  for (const item of page.Items ?? []) {
    /* each unmarshalled item */
  }
}

await transactWriteChunks(docClient, [
  { Put: { TableName: "UserTable", Item: { pk: "user#123", sk: "profile", name: "A", email: "a@ex", version: 1 } } },
  { Delete: { TableName: "UserTable", Key: { pk: "user#456", sk: "profile" } } },
]);
```



### D. Further reading

Public signals cited in the problem statement (npm downloads, GitHub code search counts, sentiment corpus size) are documented in the narrative, in [Appendix G](#appendix-g) for download ratios and community-wrapper totals, in [Appendix H](#appendix-h) for a community-vs-proposed-mapper comparison matrix, in [Appendix F](#appendix-f) for the Java Enhanced Client comparator, and in [Appendix E](#appendix-e) for the sentiment JSON bundle.



### E. Companion sentiment bundle

Full JSON corpus and headline sentiment [link](https://gist.github.com/lucianlature-endava/98e5058ee7b549d283a505eae64e647e).



### F. Schema functions over decorators and Java comparator

This appendix supports the main narrative on schema modeling: why schema functions over decorators, and how the proposed mapper compares to the Java Enhanced Client.

#### Schema functions over decorators

TypeScript decorators are usually the wrong default for a DynamoDB mapper in the JS/TS SDK for a few practical reasons:

- **Operational and build friction**: Decorators change how code is compiled. Many teams would need extra compiler settings (and sometimes runtime metadata support) to make them work consistently across Node versions, bundlers, and test runners.
- **Ecosystem mismatch in modern TS**: Plain objects + type inference work the same in serverless, edge-ish bundling contexts, and mixed JS/TS repos. A schema function like `defineSchema({ attributes, indexes })` is portable and does not ask the whole codebase to adopt a decorator model.
- **Tree-shaking and modularity**: Decorators tend to push you toward class-based, reflective patterns. That makes it harder to keep the mapper as a small, composable set of modules.
- **Runtime clarity and “escape to lower layers”**: This proposal keeps the mapper as an additive layer that composes cleanly with `DynamoDBDocumentClient` and the low-level client.
- **Versioning and stability risk**: Once a decorator-based API ships, it is hard to evolve. A schema-first functional API gives more room to iterate in preview and stabilize the surface.

References: gist.github.com/lucianlature-endava/bcecc19ce515e4c0fd428cd4c37c7b9e.

**Java Enhanced Client vs proposed JS mapper (schema values, not decorators)**


| Feature / purpose                | Java Enhanced Client                        | Proposed JS SDK v3 DataMapper (this proposal)                                                     |
| -------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Bind Java/TS type to a table     | `@DynamoDbBean` (plus table config)         | `defineSchema({ attributes, indexes })` then `DataMapper.forTable(tableName, schema, { client })` |
| Partition (hash) key             | `@DynamoDbPartitionKey`                     | `indexes.primary.pk.composite` + `indexes.primary.pk.field`                                       |
| Sort (range) key                 | `@DynamoDbSortKey`                          | `indexes.primary.sk.composite` + `indexes.primary.sk.field`                                       |
| Secondary index keys (GSI / LSI) | `@DynamoDbSecondaryPartitionKey` / …SortKey | v1: explicit index definitions under `indexes`. Caller names `IndexName` and key condition        |
| Override stored attribute name   | `@DynamoDbAttribute("name")`                | pk / sk / GSI attribute names via `field` under each index leg                                    |
| Ignore a property                | `@DynamoDbIgnore`                           | Omit the field from `attributes`                                                                  |
| Optimistic locking               | `@DynamoDbVersionAttribute`                 | `versionAttribute: true` on a numeric attribute in `attributes`                                   |
| Dynamic / per-request table name | Various patterns                            | v1: static `tableName` string passed to `forTable`                                                |
| Schema reuse / inheritance       | Class extension + annotations               | Composition: share attributes / index fragments as plain objects                                  |




### G. npm download volume and community-wrapper demand

The naïve ratio (DataMapper against the entire aws-sdk v2 package) is misleading because v2 bundles every AWS service. Both comparisons are still useful:


| Period       | DataMapper    | aws-sdk v2   | Ratio |
| ------------ | ------------- | ------------ | ----- |
| 2024 average | ~100K / month | ~41M / month | 0.24% |
| 2025 average | ~113K / month | ~37M / month | 0.31% |
| March 2026   | 115K / month  | 41M / month  | 0.28% |


**DynamoDB-only v3 clients (closer comparison):** archived DataMapper pulls (~~115K/month) vs `@aws-sdk/client-dynamodb` (~~26M/month) and `@aws-sdk/lib-dynamodb` (~16M/month) → ~0.44% and ~0.73% respectively.

**Total higher-level abstraction demand (March 2026, npm):**


| Package                    | Monthly downloads (Mar 2026) | Share |
| -------------------------- | ---------------------------- | ----- |
| ElectroDB                  | 2,278,086                    | 59.0% |
| Dynamoose                  | 766,508                      | 19.8% |
| DynamoDB-Toolbox           | 455,133                      | 11.8% |
| DynamoDB-OneTable          | 142,202                      | 3.7%  |
| DataMapper (archived)      | 115,409                      | 3.0%  |
| @typedorm/core             | 80,465                       | 2.1%  |
| Nova ODM (DataMapper fork) | 24,091                       | 0.6%  |
| **Total**                  | **3,861,894**                |       |


That total is ~~14.8% of estimated client-dynamodb users and ~24.3% of estimated lib-dynamodb users (~~one in four lib-dynamodb installs alongside a community higher-level wrapper).

**Notes:** The archived Labs DataMapper still sees ~115K/month with no first-party v3 successor. DataMapper’s share of v2 rose from 0.24% (2024) to 0.31% (2025) while v2 declined. Qualitative input from the SDK team aligns with that picture: customers who adopted DataMapper on v2 were generally happy with it. The gap is the missing **v3** successor on `@aws-sdk/`*, not lack of appetite for a mapper.



### H. Community libraries vs proposed first-party mapper (illustrative matrix)


| Dimension                              | Proposed @aws-sdk/lib-dynamodb-data-mapper                         | ElectroDB                               | DynamoDB-Toolbox                  | Dynamoose                     |
| -------------------------------------- | ------------------------------------------------------------------ | --------------------------------------- | --------------------------------- | ----------------------------- |
| Ownership                              | AWS. Ships with the JavaScript SDK family                          | Community                               | Community                         | Community                     |
| Release alignment                      | Same cadence as @aws-sdk/lib-dynamodb                              | Independent                             | Independent                       | Independent                   |
| Default “AWS path” in docs & training  | Can be the documented common case                                  | Third-party                             | Third-party                       | Third-party                   |
| Primary modeling style                 | Schema-first document mapping + typed table handle                 | Access patterns / single-table oriented | Schema definitions + Entity/Table | Mongoose-like document models |
| Scope (v1 intent)                      | CRUD/query, conditions, hooks, optimistic locking, modular helpers | Rich entity/query APIs                  | Flexible entities                 | Model-centric document layer  |
| Escape hatch to DynamoDBDocumentClient | First-class (same stack)                                           | Supported via AWS SDK underneath        | Supported                         | Supported                     |
| Opinion on single-table design         | Neutral                                                            | Strong opinions                         | Flexible                          | Flexible                      |


Why this does not dismiss community libraries: ElectroDB, DynamoDB-Toolbox, Dynamoose, and others earned their download share. The investment case is reduce fragmentation of the official story, give enterprises a supportable default, and keep advanced modeling in the ecosystem for teams that need it.



### K. Acquisition alternatives (adaptation to document client and @aws-sdk/*)

This appendix answers: for a hypothetical acquisition (AWS buys a library instead of greenfielding), how easy would it be to adapt it so it becomes the official story on top of `@aws-sdk/client-dynamodb` + `@aws-sdk/lib-dynamodb` + `DynamoDBDocumentClient.send(...)`, then ship it under `@aws-sdk/`*? Assumptions: TypeScript-first, 50/50 single-table and multi-table workloads.

**K.1 Reference design (proposed first-party DataMapper)**

- Schema values, not decorators: `defineSchema({ attributes, indexes })`.
- Table binding: `DataMapper.forTable(tableName, schema, { client })`.
- Wire path: every call is still `DynamoDBDocumentClient.send(SomeCommand)` with the same marshalling family as `@aws-sdk/lib-dynamodb`.
- Modular escape: expression builders, pagination, batch helpers compose with the same client.

**K.2 Summary ranking**


| Rank | Library               | Ease adapting to DynamoDBDocumentClient + Command                                      | Fit to reference design                                   | Learning curve         | AWS “could ship as @aws-sdk/*” (technical) |
| ---- | --------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------- | ------------------------------------------ |
| 1    | DynamoDB-Toolbox (v2) | Strong: command builder over same AWS SDK surface                                      | Closest: Entity + schema + `.build(…Command).send()`      | Medium-high            | Strong                                     |
| 2    | ElectroDB             | Moderate: v3 docs center `DynamoDBClient`. Need formal `DynamoDBDocumentClient` matrix | Partial: access-pattern-first vs neutral table-per-entity | Medium                 | Moderate                                   |
| 3    | Dynamoose             | Weak: service-style `ddb` config vs `send(Command)` everywhere                         | Farthest: Mongoose-like document models                   | Low for Mongoose users | Weakest                                    |


**K.3 How each library maps to the reference design**


| Library          | Closest match to reference design                                | Where it diverges                                                                               |
| ---------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| DynamoDB-Toolbox | Entity + Table + schema validation, emitting AWS SDK commands    | Richer validation/transforms than v1 promises. Single-table is a strength, not mandatory        |
| ElectroDB        | Entity model + indexes + composite templates, bound to one table | Access-pattern-first APIs, fluent `.patch()… .go()`, library metadata on items (e.g. `__edb_`*) |
| Dynamoose        | Schema + `model()` giving typed-ish documents                    | Documented path is service-style `ddb` configuration, not `send(Command)` everywhere            |


**K.4 Deep comparison axes**

- **Integration with the document’s wire stack**: Toolbox expects the same peer packages and command-first examples. ElectroDB officially documents v3 with `DynamoDBClient`. An acquisition program needs a supported `DynamoDBDocumentClient` matrix. Dynamoose is closest to the low-level client service class, not `DynamoDBDocumentClient` as the primary abstraction in this document.
- **50/50 single-table vs multi-table**: ElectroDB markets single-table design. Toolbox and Dynamoose are more table-centric / neutral for multi-table teams.
- **Learning curve**: Toolbox rewards strict TypeScript. ElectroDB adds access-pattern vocabulary. Dynamoose is gentle for Mongoose immigrants.
- **Could AWS ship it as @aws-sdk/*?**: Toolbox: fewest architectural surprises when renamed and in-tree. ElectroDB: ship-able with program cost to neutralize positioning and formalize DocumentClient. Dynamoose: ship-able only with heavy engineering toward command-centric paths.

**K.5 v1 capability parity and effort (qualitative)**


| v1 theme                                           | Greenfield        | DynamoDB-Toolbox                 | ElectroDB                               | Dynamoose              |
| -------------------------------------------------- | ----------------- | -------------------------------- | --------------------------------------- | ---------------------- |
| Additive DynamoDBDocumentClient only               | Large             | Parity, small packaging          | Gap: medium–large for DocumentClient CI | Gap: large–extra-large |
| Schema-first API (defineSchema / forTable)         | Extra-large       | Parity, medium rename/subset     | Medium–large to neutralize ST defaults  | Medium–large reshape   |
| Primary index typed CRUD/query                     | Large             | Parity, small–medium             | Parity, small–medium                    | Parity, small–medium   |
| GSI/LSI explicit IndexName query                   | Large–extra-large | Parity, medium                   | Strong parity, small–medium             | Parity, medium         |
| Expression / pagination / batch / locking / errors | Medium–large each | Mostly parity, small–medium gaps | Mostly parity, medium product cost      | Partial, medium–large  |


**Net effort (indicative):** Greenfield and adopt-Toolbox both **large–extra-large** with different work (capability vs governance/rename). Adopt ElectroDB or Dynamoose is **extra-large** if strict `DynamoDBDocumentClient.send(Command)` is mandatory everywhere.

**K.6 Decision pull-through**

Default program: **greenfield** aligned to this document’s reference design (max API control, IP/release clarity, v3 tenets). Acquisition-style paths (e.g. Toolbox) deserve review only if leadership prioritizes time-to-first-supported-release and accepts license, renaming, API subsetting, and long-term maintenance of concepts AWS did not originate. Rebranding a third-party library as `@aws-sdk/`* requires legal, OSS compliance, and product sign-off on roadmap ownership, breaking-change policy, and support liability.



### PoC micro-benchmark

We evaluated four DynamoDB access layers (raw AWS SDK v3 `DynamoDBDocumentClient`, DynamoDB Toolbox, ElectroDB, and Dynamoose) against a single DynamoDB table with a fixed pk/sk key schema and a shared item shape. Each stack runs in its own AWS Lambda (`CSM_aws-sdk-js-v3_StackBenchPut_{raw,toolbox,electrodb,dynamoose}`, Node.js 20.x, 4096 MB, 900s timeout). The four Lambdas are invoked sequentially so stack timings are isolated.

Each Lambda runs a time-bounded PutItem-only phase: one untimed primer, then warmup puts, then measured puts. The loop is strictly sequential (one `await` per iteration). Keys spread across 16 shards by default to avoid hot-partition throttling. For each measured put we publish `PutLatency` (ms) to CloudWatch in namespace `aws-sdk-js-v3` with dimensions `ClientType=StackBench`, `Stack`, `Size`, `OperationName=PutItem`, `Platform=lambda`.

**Representative result (eu-west-1, Size=Small, Platform=lambda):** raw ≈ 4.8 ms. ElectroDB ≈ 4.9 ms (~~+2% vs raw). DynamoDB Toolbox ≈ 5.2 ms (~~+8% vs raw). Dynamoose ≈ 6.3 ms (~+31% vs raw). Service-side time is effectively constant across stacks (except Dynamoose’s bridge path). Ordering reflects client-side mapping cost. Full methodology in the [PoC micro-benchmark](#appendix-poc) appendix source.



### Program plan (product engineering)

For AWS program leadership (quarterly planning, resourcing, go/no-go gates). Scope: **JavaScript v3 Data Mapper** Phases 0–5 (design through GA, automated tests, developer documentation, perf CI gates). **Calendar anchor:** implementation start **1 June 2026**. GA **30 September 2026** (17 weeks, compressed vs the earlier May-start draft). Not gated on other Foundation proposals in this repository.


| Name                           | Track       | Notes                                                       | Size | ECD        |
| ------------------------------ | ----------- | ----------------------------------------------------------- | ---- | ---------- |
| Design alignment (Phase 0)     | Governance  | Agree v1 scope and SDK vs DDB review owners (2 weeks)       | M    | 14/06/2026 |
| Private preview (Phase 1)      | Engineering | Installable build, primary-index CRUD, Local CI (5 weeks)   | XL   | 19/07/2026 |
| Perf CI (Phase 2)              | Engineering | Regression gates in CI (3 weeks)                            | L    | 09/08/2026 |
| Wider preview (Phase 3)        | Engineering | Docs, expressions, paging, batch, named GSI query (4 weeks) | XL   | 06/09/2026 |
| Release candidate (Phase 4)    | Release     | API freeze, migration guide, full matrix (2 weeks)          | L    | 20/09/2026 |
| Calendar buffer                | Program     | Release train slip absorption (1 week)                      | S    | 27/09/2026 |
| General availability (Phase 5) | Release     | Supported package on normal AWS SDK cadence                 | M    | 30/09/2026 |


**Surface vs phase (summary)**


| Surface / v1 theme                                           | Phase 1                          | Phase 3                          | Phase 4          |
| ------------------------------------------------------------ | -------------------------------- | -------------------------------- | ---------------- |
| Core DataMapper (defineSchema, forTable, primary CRUD/query) | Required                         | Hardening + samples              | API freeze       |
| Expression / condition / update builders                     | Primary-path for Phase 1 updates | Modular surface, grow from usage | Stable for GA    |
| Pagination helpers                                           | Optional stub                    | Required for v1                  | Frozen           |
| Batch / transact utilities                                   | Out of Phase 1 gate              | Required minimal surface         | Frozen           |
| Explicit GSI/LSI typed query                                 | Out of Phase 1 gate              | Required for v1 intent           | Stable for GA    |
| Optimistic locking                                           | In scope when version declared   | Hardened docs/edge cases         | Frozen           |
| Error taxonomy (mapper vs service)                           | Draft for dogfood                | Written spec                     | Release-blocking |


**Risk register (short)**


| Risk                                                           | Likelihood | Impact | Mitigation                                                    |
| -------------------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------- |
| Smithy / codegen or middleware churn breaks mapper assumptions | Medium     | High   | Early spike. Pin to release train branches with JS SDK owners |
| AWS merge policy or repo visibility delays integration         | Medium     | Medium | Pre-agree branch/PR policy. Small mergeable increments        |
| GSI/LSI or expression-builder scope creep delays Phase 5       | High       | Medium | v1 scope as contract. Change board after Phase 3 exit         |
| Preview API churn burns early adopters                         | Medium     | High   | Strict semver for preview channels. Clear deprecation notes   |




### J. Estimation and priority labels

Definitions: **M** = medium (governance / ~~2 weeks). **L** = large (~~3 weeks). **XL** = extra-large (multi-week engineering track). Effort words in [Appendix K](#appendix-k) (small / medium / large / extra-large) use the same scale for relative sizing only, not person-months.

---

**Meeting notes:** None yet.