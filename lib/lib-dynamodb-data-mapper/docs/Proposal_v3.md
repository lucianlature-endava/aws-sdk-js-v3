# First-party DynamoDB DataMapper for AWS SDK JavaScript v3

**Author:** Endava Team  
**For:** DynamoDB and AWS SDK for JavaScript leadership  
**Document phase:** Review ready v2.0 (proposal body). Technical detail is in the [Appendix](#appendix) and is excluded from the page count.

**Owners**: Lucian Lature / Endava Team

**Primary reviewers**: DDB Service Team

**Secondary reviewers**: AWS SDK Team

This document explains what we plan to ship, where version 1 stops, and how the work is staged. It also covers how we will respond to the concerns reviewers usually raise about API stability, bundle size, performance, operational safety, and coexistence with community libraries. Evidence, API sketches, benchmarks, community comparisons, and the full program plan are in the [Appendix](#appendix) and are not repeated here.

## Executive summary and decision

We are asking for two decisions. First, endorse a full cross-SDK DynamoDB ODM program: a shared rationale, a published roadmap, and named owners. That program describes how other teams/languages *could* follow the same path. Peer teams have expressed willingness to align, but their delivery is not part of this approval. Second, ship Phase 1 for JavaScript and TypeScript as an official, additive, opt-in package in the `@aws-sdk/`* family (working name `@aws-sdk/lib-dynamodb-data-mapper`). That JavaScript work is the committed engineering in this document. It sits on top of `@aws-sdk/lib-dynamodb` and `DynamoDBDocumentClient` and offers schema-first typed create, read, update, delete, and query, along with helpers for expressions, pagination, and batch or transactional writes. The DynamoDB wire contract does not change. Teams can still call the document client directly whenever they need to.

Today many teams live between a verbose low-level client and a document client that has no supported mapping layer. The archived AWS Labs DataMapper left a hole on the **v3** line, not a rejection of mapping itself: the SDK team has reported that customers who used DataMapper on **v2 were satisfied** with it. The problem is succession: there is no first-party, supported mapper on the modular v3 stack, so those teams either stay on legacy `aws-sdk` v2, adopt community libraries, or build internal wrappers. Download and repository signals ([Appendix G](#appendix-g) and [Appendix E](#appendix-e)) reinforce that the need persists (~115K monthly pulls on the archived DataMapper alone, plus substantial community-wrapper use). Java and .NET already ship first-party elevated clients.

TypeScript backends and serverless are now the default for DynamoDB. Developers expect to work with schemas and objects, not only attribute maps. A first-party ODM gives training and enterprise support a single anchor.

We draw on the same product pattern Microsoft uses with **EF Core on Azure Cosmos DB**: an official object-mapping layer for teams that want schemas and entities, with clear store semantics and room to grow over time, without treating the database like a relational engine (see [What EF Core on Cosmos teaches this program](#ef-core-cosmos-precedent)).

Leadership has signaled that the deliverable **could** be a full cross-SDK ODM program: one story for customers, shared principles, and a roadmap other language teams *may* follow if that direction is approved. Several peer SDK teams have said they are willing to adopt the same ODM direction once a charter exists. This willingness is not a committed schedule or staffing plan for those languages, however this document proposes that program frame and commits engineering to the JavaScript document mapper (general availability targeted for September 2026) as the first milestone, not a JavaScript-only experiment. See [Cross-language ODM direction](#cross-language-odm-direction-strategic-alignment).

The goal is general availability as first-party `@aws-sdk/*` software with named AWS ownership, support on par with other v3 libraries, and a normal product lifecycle. It is not a Labs-only drop. The first engineering slice is the JavaScript v3 modular line (v2 `aws-sdk` stays legacy). The [cross-language roadmap](#cross-language-odm-direction-strategic-alignment) notes willingness from other languages; it does not schedule their delivery.

---

## Classical DataMapper proposal versus the ODM program

Earlier drafts of this work read like a **classical DataMapper proposal**. The ask was narrow and familiar: ship one official JavaScript package on SDK v3 that replaces the gap left by the archived Labs DataMapper. Reviewers would judge API shape, version 1 scope, performance, and general availability on a single timeline (June through September 2026). Success meant a supported `@aws-sdk/lib-dynamodb-data-mapper` that teams could adopt instead of community wrappers, with the same stack they already use (`DynamoDBDocumentClient` underneath, escape hatch intact). That body of work is still valid. The package design, tenets, [appendix](#appendix) sketches, and engineering plan for version 1 are largely unchanged.

**This document (Proposal v3) adds a different decision on top of that package.** Leadership is asked to endorse a **full cross-SDK DynamoDB ODM program** as the strategic frame. Peer SDK teams have signaled **willingness** to follow that path. They have not committed dates or resourcing in this document. The classical proposal answered “what do we ship for JavaScript in 2026?” The ODM program answers “what is AWS’s long-term, multi-language story for schema-driven DynamoDB access, and how could we stage it if other languages join later?”

The table below is the shortest way to see the shift. The rows are about **governance and scope**, not about throwing away the mapper work.


| Topic                        | Classical DataMapper proposal                                                                 | ODM program (this proposal)                                                                                                                                           |
| ---------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **What leadership approves** | One new first-party npm package for JavaScript v3                                             | A cross-SDK program (charter, roadmap, owners, gates) **and** JavaScript Phase 1 as its first deliverable                                                             |
| **Primary deliverable**      | General availability of `@aws-sdk/lib-dynamodb-data-mapper`                                   | The same GA package **plus** a published multi-language ODM plan customers and other SDKs can follow                                                                  |
| **Languages**                | JavaScript and TypeScript on the v3 modular line only                                         | JavaScript Phase 1 is committed here. Other SDKs: peer **willingness** to follow the ODM path, not committed delivery in this document                                |
| **Relation to Java / .NET**  | “Parity in spirit” with Enhanced Client and .NET persistence                                  | Map existing elevated clients to one ODM definition for comparison. Peer **willingness** to follow the path, not joint delivery commitments                           |
| **Version 1 scope**          | Typed schema, table handle, CRUD/query, helpers (unchanged)                                   | **Same** technical scope for the package. Stages 2 and 3 are directional (JS follow-on and program vision), not other-SDK scope in this approval                      |
| **How success is measured**  | Package adopted, docs updated, support burden understood                                      | **Committed:** JavaScript package GA. **Program:** charter signed, parity matrix published. Other SDKs: willingness recorded, not preview/GA targets in this document |
| **What did not change**      | Additive package, schema-as-code, faithful DynamoDB semantics, [appendix](#appendix) evidence | Unchanged. Phase 1 is still the document mapper described in the rest of this document                                                                                |


In practice, a reviewer who approved the classical proposal should still recognize the JavaScript package. A reviewer who only sees the ODM program should still understand that **September 2026 GA is concrete engineering**, not a charter exercise. The classical ask is the **first milestone** of the larger program, not a competing idea.

If stakeholders need one line for a staff meeting: **we are not choosing between “mapper” and “ODM.” We are funding the JavaScript mapper as Phase 1 and defining a cross-SDK ODM program that other languages have said they are willing to follow when they staff it.**

---

## Problem

Teams cannot define an item shape once and reuse it safely across reads and writes in an AWS-supported way. That leads to repeated boilerplate, expression mistakes, and inconsistent patterns between services.

The Labs DataMapper was archived and never replaced in the official v3 family. Many teams use community libraries or internal wrappers instead. Roughly one in four `lib-dynamodb` installs also pull in a higher-level wrapper ([Appendix G](#appendix-g)). Qualitative feedback on the JavaScript and TypeScript path points to unnecessary friction: DynamoDB feels harder than it needs to ([Appendix E](#appendix-e), directional).

A single hand-built `UpdateCommand` on the document client is fine. At scale, copy-paste and subtle key or expression bugs add up. Only a first-party package can become the consistent, supported standard customers expect from AWS.

---

## Tenets (fixed for review and delivery)

The package is additive. It sits on the stack customers already use, adoption is opt-in, and teams can drop down to `DynamoDBDocumentClient` or `@aws-sdk/client-dynamodb` at any time.

Schemas are plain code: `defineSchema({ attributes, indexes })` with strong TypeScript inference. Decorators are not required (see [Appendix F](#appendix-f)).

Security and operations match the document client: same credentials, IAM, and logging posture, with no payloads or secrets in default logs.

Version 1 is ODM Phase 1, a document mapper: a thin mapping layer that stays faithful to DynamoDB semantics. Entity registry, multi-table patterns, and richer helpers come later on the [cross-language roadmap](#cross-language-odm-direction-strategic-alignment). Version 1 does not prescribe single-table frameworks, create tables from application code, or bundle DAX.

The design is modular: a core mapper plus optional pieces for expressions, pagination, and batch or transactional utilities.

Mapper validation errors are reported separately from DynamoDB service errors such as throttling or conditional check failures.

---

## What we are launching

We propose `@aws-sdk/lib-dynamodb-data-mapper` (final name TBD), built on `DynamoDBDocumentClient`.

Developers define a schema, bind it with `DataMapper.forTable(tableName, schema, { client })`, and get typed put, get, update, delete, and query against their application row shape. Optional hooks and optimistic locking are available when a version attribute is declared on the schema.

Version 1 also includes helpers for building expressions and conditions, paginating with `LastEvaluatedKey`, and chunking batch writes and transactions to service limits. These can be used with or without the table handle (sketches in [Appendix C](#appendix-c)).

Customers gain one documented AWS path. Adoption can be incremental: pin a version or stop importing to roll back. The experience aligns with how Java and .NET already elevate DynamoDB on their SDKs.

The happy path is unchanged at the bottom of the stack: configure `DynamoDBDocumentClient` as today, add the mapper package, call `defineSchema`, then `forTable`, then typed CRUD or query. [Appendix C](#appendix-c) walks through a full example. [Appendix F](#appendix-f) maps concepts to the Java Enhanced Client.

ElectroDB, DynamoDB-Toolbox, and Dynamoose remain valid choices for teams that want stronger opinions. AWS documentation can describe a default path on the official stack while pointing to the comparison matrix and adopt-versus-build notes in [Appendix H](#appendix-h) and [Appendix K](#appendix-k).

Early PutItem benchmarks ([Appendix: PoC micro-benchmark](#appendix-poc)) show the raw document client fastest, Toolbox and ElectroDB within roughly 2–8% median overhead, and Dynamoose higher. We intend to keep mapper overhead close to the document-client path and to establish CI baselines before we publish numeric targets.

---

## Design decisions (summary)

The table below records the main choices and tradeoffs. Wording is intentional for review. Details sit in the [appendix](#appendix).


| Decision         | Choice                                                     | Tradeoff                                                                                                                                |
| ---------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Delivery         | Additive package, not inside `lib-dynamodb` or codegen     | We own another package, but previews can move quickly and the escape hatch stays obvious                                                |
| Modeling         | Schema-first primary experience                            | A small upfront schema cost reduces long-term drift                                                                                     |
| Adoption shape   | Core mapper plus separate helper modules                   | More surfaces to version, but teams can adopt piece by piece                                                                            |
| v1 breadth       | ODM Phase 1: lightweight document mapper (JavaScript)      | Only committed language work in this document. [Roadmap](#cross-language-odm-direction-strategic-alignment) shows willingness elsewhere |
| Deferred scope   | Auto-GSI routing, decorators-first, DAX, table-from-code   | Directional program stages 2–3 on [roadmap](#cross-language-odm-direction-strategic-alignment), not other-SDK commitments               |
| Expressions      | Minimal builder set in v1                                  | Fewer string bugs without an open-ended expression language in v1                                                                       |
| Indexes          | Caller supplies `IndexName` and key condition              | Keeps cost and correctness visible to the developer                                                                                     |
| Schema evolution | Forward-compatible reads by default, strict modes optional | Safer reads. Migration tooling specified before API freeze                                                                              |
| Versioning       | Same semver rules as other `@aws-sdk/`* packages           | Preview channels and deprecation notices manage churn                                                                                   |


[Appendix K](#appendix-k) ranks building greenfield versus adopting a community library. Greenfield is the default for API control and release clarity. Adopting a library such as Toolbox is worth discussion only if leadership prioritizes time to first preview.

---

## Cross-language ODM direction (strategic alignment)

A first-party DynamoDB ODM on the official client stack would materially improve how customers build on DynamoDB. Leadership has indicated the deliverable **could** be a full cross-SDK **program definition**: one story in docs and support, shared design principles, and a published roadmap with owners and review gates. This document asks leadership to endorse that possible frame and to **fund JavaScript Phase 1** as the only committed engineering in this approval.

Several other SDK teams have told us they are **willing** to follow the same ODM path after a charter exists. That is valuable alignment signal. It is **not** a commitment from those teams to ship on our Stage 1 timeline, to enter preview on a fixed date, or to take scope from this repository. Their roadmaps remain their own once the shared definition is published.

Concretely, we need approval for the cross-SDK program (charter, roadmap, owners, gates) and funding for Phase 1, the JavaScript document mapper described in this proposal. Phase 1 is the same kind of product Java and .NET already ship: typed mapping over the service API. Stages 2 and 3 in the table below describe **where the program could go** on JavaScript and **what peer willingness implies** for other languages. They are not bundled delivery promises for other SDKs in this document.

The ODM we mean is official and teachable. Customers get one AWS-supported path for schemas and entities in documentation, training, and enterprise support. It is not another community fragment or a Labs-only experiment.

It stays faithful to how DynamoDB works. Partition keys, index names, conditionals, and capacity remain visible in the API and in docs. We are not building hidden index routing, surprise scans, or schema migrations driven from application code.

It stays composable. Every ODM call still ends in `DynamoDBDocumentClient.send(Command)`. Teams can use the document client directly whenever they need to. We are not creating a separate persistence platform inside `@aws-sdk/`*.

It stays consistent across languages. Java should not keep an elevated client while JavaScript stays on raw `lib-dynamodb` indefinitely. Shared principles and comparable concepts are the goal.

**Illustrative program roadmap** (JavaScript Phase 1 dates match [Timeline](#timeline-illustrative). The “Other SDKs” column records **willingness only**, not committed actions or dates.)


| Stage                  | Program focus (directional)                                                              | JavaScript v3 (committed in this document)           | Other SDKs (willingness only, not committed)                                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Stage 0 (charter)      | ODM rationale, API principles, owners, gates                                             | Design alignment (May 2026)                          | Socialize draft ODM definition with peer teams. Map Java Enhanced Client and .NET to the same story for comparison, not delivery.              |
| Stage 1 (mapper GA)    | Typed CRUD and query, expression helpers, batch chunking                                 | **Committed:** GA targeted September 2026            | Publish parity matrix ([Appendix F](#appendix-f)). Peer teams have expressed willingness to align over time; no other language GA is in scope. |
| Stage 2 (ODM core)     | Entity registry, multi-table patterns, stricter schema modes, shared errors (if pursued) | Possible follow-on on the mapper package after JS GA | Peer teams have signaled willingness to follow the ODM path; any preview or GA requires their own approval and staffing.                       |
| Stage 3 (ODM advanced) | Richer helpers tied to access patterns, streams, optional codegen (if pursued)           | Expand when evidence and perf CI support it on JS    | Same as Stage 2: willingness to align, not a committed multi-SDK release schedule.                                                             |


If leadership adopts the cross-SDK ODM direction, the strategic deliverable would be that **program definition**, alongside **committed** JavaScript Phase 1 engineering. The sequencing we own in this document is: lock the charter and roadmap at Stage 0, ship JavaScript general availability at Stage 1 on the schedule in [Timeline](#timeline-illustrative). What happens in other languages afterward depends on those teams, not on this approval.

In one sentence: endorse the cross-SDK ODM program (rationale, roadmap, owners), approve **JavaScript Phase 1** as committed work, and treat other languages as willing to follow the path when they choose to staff it.

### Questions we expect in review

The following points came from independent reviews (TypeScript, product, cloud architecture, and Java SDK perspectives). They are written as we would answer them in a review meeting.

Some reviewers will ask why we do not ship the entire ODM surface in `@aws-sdk/`* on day one. Customers should get the full program, not one oversized JavaScript release. Phase 1, targeted for September 2026, delivers the document mapper. Every call still goes through `DynamoDBDocumentClient.send(Command)`. Later stages on the **illustrative** roadmap could add entity registry, multi-table patterns, and richer helpers on JavaScript, and peer teams could adopt the same ideas when they staff their own work. Staging is how we describe one program without pretending every language ships on our calendar.

Others will note that Java already has the Enhanced Client and ask whether JavaScript is second class. We do not think so. Parity means the same kind of product: schema-first typed mapping over the wire API. [Appendix F](#appendix-f) maps Enhanced Client ideas to the JavaScript API we propose. Other SDKs have said they are willing to align to shared principles; that is not the same as a committed joint release.

Some architects worry that a higher-level client will hide partition keys and indexes and encourage bad table design. Our design keeps those choices explicit. Callers still name the index, supply key conditions, and write condition expressions. Capacity and throttling behave as they do today. We want a simpler developer experience without obscuring how DynamoDB bills and scales.

Finally, if ODM is strategic, why phase at all? Phasing separates what we **commit** now (JavaScript Phase 1 plus program charter) from what we **describe** for later (richer ODM on JS, and willingness from other languages to follow the same path). Stage 0 fixes the charter and roadmap. Stage 1 closes the largest gap on JavaScript v3 in 2026. Stages 2 and 3 are directional for the program; other SDKs move only when those teams commit their own plans.

Some reviewers will ask why we do not ship “EF for DynamoDB”. EF Core on Cosmos shows that enterprises adopt a **platform-owned** mapping layer when it matches how they already build. It also shows what goes wrong when teams treat a document store like SQL: LINQ can compile to cross-partition or expensive queries, and request units surprise teams that skip review. Our answer is the same category of product with different store rules: a teachable official default, a thin Phase 1 mapper, and every call still ending on `DynamoDBDocumentClient.send(Command)`.

---



## What EF Core on Cosmos teaches this program (precedent)

**Entity Framework Core** on **Azure Cosmos DB** is the closest in-house analogue to what we propose for DynamoDB: a first-party object-mapping path on top of a document-oriented API, not a relational database wearing a different connection string. .NET teams use `DbContext`, entity classes, and LINQ; the EF Core Cosmos provider translates those calls into the Cosmos client. That is an **ODM** story, not “SQL Server in the cloud.”

What worked is worth copying. Microsoft gave .NET customers an official, documented way to work with items and containers using skills they already had. Teams that outgrew the abstraction could still use the Cosmos SDK for advanced scenarios. Adoption accelerated where access patterns were simple and partition discipline was enforced in design and review.

What failed when teams ignored store semantics is worth copying too. Convenience turned costly when LINQ produced scans or cross-partition queries that looked innocent in code. Change tracking and a broad EF surface added overhead compared with a thin client path. The lesson is not “do not ship ODM.” The lesson is **ship ODM that keeps partition keys, indexes, and cost visible**, stage depth over time, and preserve an escape hatch.

For DynamoDB, that implies the program we describe in this document: a cross-SDK ODM **definition** leadership **could** adopt, with **committed** JavaScript Phase 1 as a document mapper faithful to access patterns (explicit `IndexName`, key conditions, conditionals). Stages 2 and 3 on the [cross-language roadmap](#cross-language-odm-direction-strategic-alignment) are directional for richer ODM on JavaScript and for how other languages might align if they staff their own work. We are not proposing to clone EF’s breadth or LINQ model on day one.


|                               | EF Core + Cosmos DB                   | This program (DynamoDB ODM)                                                                |
| ----------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------ |
| Official stack                | EF Core provider on Cosmos (.NET)     | `@aws-sdk/`* document mapper (Phase 1, JavaScript)                                         |
| Day-one breadth               | Broad EF surface (with provider gaps) | Narrow mapper; later program stages are directional                                        |
| Partition and cost visibility | Easy to obscure behind LINQ           | Keys, index name, and conditionals stay explicit in API and docs                           |
| Escape hatch                  | Cosmos SDK                            | `DynamoDBDocumentClient.send(Command)`                                                     |
| Cross-language                | Centered on .NET                      | Program frame; JavaScript committed; other SDKs willing to align, not committed to deliver |


This precedent supports endorsing ODM as a strategic direction. It does not require matching EF feature-for-feature in September 2026. It requires the same discipline: official teachability, staged delivery, and respect for how the underlying service bills and scales.

---

## V1 scope

Version 1 is a schema-first API. Attributes are scalar-first in v1. Sets, maps, and nested shapes can deepen during preview ([Appendix F](#appendix-f) and [Appendix B](#appendix-b)). It covers get, put, update, delete, and query on the primary key. Queries against a GSI or LSI require an explicit `IndexName` and a typed key condition. The mapper does not pick an index automatically.

Version 1 includes a small set of expression and condition builders, pagination helpers, and utilities that chunk batch writes and transactions to service limits. Optimistic locking is supported when the schema marks a version attribute. Optional typed lifecycle hooks are in scope. We will separate mapper validation errors from DynamoDB service errors and commit to that split at API freeze.

TTL, conditionals, transactions, and raw batch APIs remain available through the same `DynamoDBDocumentClient` instance customers already configure. Typed wrappers for those paths may follow later.

Automatic GSI routing, prescribed single-table frameworks, creating tables from application code, bundling DAX, a decorator-first API, a Labs compatibility shim, and streams mapping are out of scope for this package. They belong to ODM stages 2 and 3 on the [cross-language roadmap](#cross-language-odm-direction-strategic-alignment). That is a schedule choice, not a rejection of the ideas.

This package is ODM Phase 1 for JavaScript inside the cross-SDK program frame. Stages 2 and 3 describe possible follow-on scope on JavaScript and how other teams might align; they are not committed multi-SDK delivery in this document. API illustrations are in [Appendix A](#appendix-a) through [Appendix C](#appendix-c).

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

The cross-SDK ODM program begins with Stage 0 (charter). Engineering for JavaScript Phase 1 is planned from 1 May 2026 through general availability at the end of September 2026. Dates below are planning estimates until staffing and gates are firm. Phase breakdown, surface-to-phase mapping, and risks are in [Appendix: Program plan](#appendix-program-plan) and [Appendix J](#appendix-j).


| Phase | Milestone                              | Duration (weeks) | ECD        |
| ----- | -------------------------------------- | ---------------- | ---------- |
| 0     | Design alignment (API + owners)        | 2                | 14 May '26 |
| 1     | Private preview (installable slice)    | 6                | 25 Jun '26 |
| 2     | Perf CI (gates)                        | 3                | 16 Jul '26 |
| 3     | Wider preview (docs + breadth)         | 5                | 20 Aug '26 |
| 4     | Release candidate (freeze + migration) | 3                | 10 Sep '26 |
| —     | Calendar buffer                        | —                | 16 Sep '26 |
| 5     | General availability                   | 2                | 30 Sep '26 |


Private preview corresponds to Phase 1 in the program plan, wider preview to Phase 3, release candidate to Phase 4 (API freeze and migration guide), and general availability to Phase 5.

This work is not gated on other Foundation proposals in this repository.

---

## Appendix

*(Supporting material—not counted toward proposal page limit.)*

**Contents:** [A](#appendix-a) · [B](#appendix-b) · [C](#appendix-c) · [D](#appendix-d) · [E](#appendix-e) · [F](#appendix-f) · [G](#appendix-g) · [H](#appendix-h) · [J](#appendix-j) · [K](#appendix-k) · [PoC](#appendix-poc) · [Program plan](#appendix-program-plan)



### A. Architecture (illustrative)

The mapper sits above the document client. The generated clients stay unchanged; the mapper wraps them in place and keeps a single source of generated code. The mapper layer is modular: it comprises a core DataMapper package plus expression and condition builders, pagination helpers, and batch and transaction utilities (separate npm packages, stable subpath exports under one umbrella, or both, to be decided at implementation stage). The diagram shows those four surfaces explicitly.

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

The following declaration sketch matches the attributes + indexes shape used in [Appendix C](#appendix-c) (Core mapper) (same separation as ElectroDB’s schema model). Attributes hold business fields only; indexes.primary maps DynamoDB pk / sk attribute names to composite attribute names. SchemaFields is inferred from attributes; RowSchema is that row type; KeyInput is inferred from the primary index composites. This appendix is incomplete on purpose: a shipping package would add GSIs, overloads, and stricter update / query key shapes. `const` on the schema parameter assumes a modern TypeScript version that preserves literal field types.

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

The following sketches illustrate style only; names, paths, and signatures may differ at ship time. Part one focuses on the core mapper (`defineSchema`, `DataMapper.forTable`, typed table operations). Part two shows how modular helpers might appear as separate imports (subpackages or stable subpath exports under one umbrella) for teams that want building blocks without adopting the full table abstraction.

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

Public signals cited in the problem statement (npm downloads, GitHub code search counts, sentiment corpus size) are documented in the narrative, in [Appendix G](#appendix-g) for download ratios and community-wrapper totals, in [Appendix H](#appendix-h) for a community-vs-proposed-mapper comparison matrix, in [Appendix F](#appendix-f) for Java Enhanced Client and EF Core on Cosmos implementation comparators, and in [Appendix E](#appendix-e) for the sentiment JSON bundle.



### E. Companion sentiment bundle

Full JSON corpus and headline sentiment link.



### F. Schema functions over decorators, comparators, and EF-on-Cosmos implementation patterns

This appendix supports the main narrative on schema modeling ([What EF Core on Cosmos teaches this program](#ef-core-cosmos-precedent)) with feature-level and implementation-level detail.

#### Schema functions over decorators

TypeScript decorators are usually the wrong default for a DynamoDB mapper in the JS/TS SDK for a few practical reasons:

- **Operational and build friction** — Decorators change how code is compiled. Many teams would need extra compiler settings (and sometimes runtime metadata support) to make them work consistently across Node versions, bundlers, and test runners.
- **Ecosystem mismatch in modern TS** — Plain objects + type inference work the same in serverless, edge-ish bundling contexts, and mixed JS/TS repos. A schema function like `defineSchema({ attributes, indexes })` is portable and does not ask the whole codebase to adopt a decorator model.
- **Tree-shaking and modularity** — Decorators tend to push you toward class-based, reflective patterns. That makes it harder to keep the mapper as a small, composable set of modules.
- **Runtime clarity and “escape to lower layers”** — This proposal keeps the mapper as an additive layer that composes cleanly with `DynamoDBDocumentClient` and the low-level client.
- **Versioning and stability risk** — Once a decorator-based API ships, it is hard to evolve. A schema-first functional API gives more room to iterate in preview and stabilize the surface.

References: gist.github.com/lucianlature-endava/bcecc19ce515e4c0fd428cd4c37c7b9e.

**Java Enhanced Client vs proposed JS mapper (schema values, not decorators)**


| Feature / purpose                | Java Enhanced Client                        | Proposed JS SDK v3 DataMapper (this proposal)                                                     |
| -------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Bind Java/TS type to a table     | `@DynamoDbBean` (plus table config)         | `defineSchema({ attributes, indexes })` then `DataMapper.forTable(tableName, schema, { client })` |
| Partition (hash) key             | `@DynamoDbPartitionKey`                     | `indexes.primary.pk.composite` + `indexes.primary.pk.field`                                       |
| Sort (range) key                 | `@DynamoDbSortKey`                          | `indexes.primary.sk.composite` + `indexes.primary.sk.field`                                       |
| Secondary index keys (GSI / LSI) | `@DynamoDbSecondaryPartitionKey` / …SortKey | v1: explicit index definitions under `indexes`; caller names `IndexName` and key condition        |
| Override stored attribute name   | `@DynamoDbAttribute("name")`                | pk / sk / GSI attribute names via `field` under each index leg                                    |
| Ignore a property                | `@DynamoDbIgnore`                           | Omit the field from `attributes`                                                                  |
| Optimistic locking               | `@DynamoDbVersionAttribute`                 | `versionAttribute: true` on a numeric attribute in `attributes`                                   |
| Dynamic / per-request table name | Various patterns                            | v1: static `tableName` string passed to `forTable`                                                |
| Schema reuse / inheritance       | Class extension + annotations               | Composition: share attributes / index fragments as plain objects                                  |


#### EF Core on Cosmos: features and implementation patterns

**Entity Framework Core** with the **Azure Cosmos DB** provider is the closest in-house analogue to a platform-owned ODM on a document API. The provider maps `DbContext`, entity types, and LINQ to items in containers. It is not a relational EF provider. The useful lessons for this proposal are **how mapping is implemented**, not copying LINQ or full EF breadth into JavaScript on day one.

**Metadata-first model.** EF builds a model at startup: container, partition key path, key properties, concurrency token, and property-to-JSON mapping. The proposed mapper does the same with `defineSchema({ attributes, indexes })` compiled to an internal table model (primary and secondary index legs, version field, attribute types). No reflection or decorator requirement is needed for Phase 1.

**Command pipeline.** EF tracks entity state, builds provider requests, and executes against Cosmos. The proposed path is explicit: validate the application row against the schema, map to document-client attribute shapes, build `PutItem` / `GetItem` / `UpdateItem` / `DeleteItem` / `Query` commands, then `DynamoDBDocumentClient.send(Command)`. Phase 1 does **not** include an EF-style change tracker that turns dirty objects into hidden updates.

**Partition key discipline.** EF requires partition key metadata on entities and uses it on create and partition-scoped reads. Phase 1 requires complete key material for the declared partition key (and sort key when modeled) on every keyed operation. Queries must supply a typed key condition that includes the partition leg. There is no table-scan helper in v1.

**Optimistic concurrency.** EF maps Cosmos **ETag** to a concurrency token; conflicting saves surface as `DbUpdateConcurrencyException`. Phase 1 maps a declared `versionAttribute` on the schema to conditional writes on update (and optionally on delete). Mapper validation errors stay separate from DynamoDB conditional check failures.

**Updates: partial by intent.** EF can emit partial patches when change tracking marks dirty properties; blind full-document replace is a common foot-gun under RU billing. Phase 1 favors explicit partial updates through condition and update builders; full replace remains available when the caller chooses it, not as a hidden default.

**Hooks, not silent tracking.** EF `SaveChanges` integrates change tracking by default. For Cosmos, that pattern often produces surprise queries or patches. Phase 1 offers optional lifecycle hooks (for example `beforePut`) and explicit `put` / `update` / `delete` calls instead of implicit dirty tracking. Light change tracking, if ever added, belongs on the directional program roadmap, not in the committed September 2026 slice.

**Escape hatch tiers.** EF teams drop to the Cosmos SDK or raw SQL for advanced scenarios. Customer documentation for this mapper should mirror that story: typed table handle first, same `DynamoDBDocumentClient` instance for advanced commands, then `@aws-sdk/client-dynamodb` when required.

**EF Core on Cosmos vs proposed JS mapper (implementation)**


| Feature / purpose               | EF Core + Cosmos DB                                      | Proposed JS SDK v3 DataMapper (Phase 1)                                 |
| ------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------- |
| Model definition                | Fluent API / attributes on entity classes                | `defineSchema({ attributes, indexes })` (plain objects, inferred types) |
| Container / table binding       | Entity type → Cosmos container                           | `DataMapper.forTable(tableName, schema, { client })`                    |
| Partition key                   | Required metadata; `WithPartitionKey` for scoped queries | `indexes.primary.pk`; required key material on writes and queries       |
| Sort key                        | Modeled on entity                                        | `indexes.primary.sk` when table uses composite primary key              |
| Nested document fields          | Owned entity types embedded in JSON                      | v1 scalar-first; nested maps/lists deepen in preview / Stage 2          |
| Create / read / update / delete | `DbSet`, LINQ, `SaveChanges`                             | Explicit `put`, `get`, `update`, `delete`, `query` on table handle      |
| Query composition               | LINQ translated to Cosmos SQL (cross-partition risk)     | Caller supplies `IndexName` and key condition; no LINQ in v1            |
| Optimistic concurrency          | ETag as concurrency token                                | `versionAttribute` → conditional expressions                            |
| Change tracking                 | Built into `DbContext`                                   | **None in v1**; explicit operations and optional hooks                  |
| Batch / transactional writes    | Provider and SDK features                                | Chunking helpers to service limits (v1 intent)                          |
| Diagnostics                     | EF logging, interceptors, diagnostics                    | Optional injection hooks; caller-owned telemetry                        |
| Raw / advanced access           | Cosmos SDK, SQL API                                      | Same `DynamoDBDocumentClient.send(Command)` and low-level client        |


**Mapping EF ideas to program phases**


| EF-on-Cosmos idea               | Phase 1 (committed) | Stages 2–3 (directional)                             |
| ------------------------------- | ------------------- | ---------------------------------------------------- |
| Metadata-first keys and version | Yes                 | Stricter schema modes, shared error taxonomy         |
| Explicit command pipeline       | Yes                 | Typed batch helpers per entity                       |
| Partition-scoped queries        | Yes                 | Dev-time warnings for weak key conditions (optional) |
| Owned / nested JSON shapes      | Scalars only in v1  | Nested attributes, value converters                  |
| Change tracking / dirty patches | **No**              | Only if evidence supports explicit opt-in API        |
| LINQ-style ad hoc query         | **No**              | **No** (access-pattern–faithful query only)          |
| Global soft-delete filters      | **No**              | Opt-in query filters on schema                       |
| Interceptors                    | Hooks only          | Richer before/after `send` middleware                |


**Explicit non-goals carried over from EF lessons:** migrations or DDL from application code; relationship fix-up; lazy loading; implicit index or partition inference; cross-partition joins. Those are out of scope for the same reasons they are hazardous on Cosmos under EF.



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

**Notes:** The archived Labs DataMapper still sees ~115K/month with no first-party v3 successor. DataMapper’s share of v2 rose from 0.24% (2024) to 0.31% (2025) while v2 declined. Qualitative input from the SDK team aligns with that picture: customers who adopted DataMapper on v2 were generally happy with it; the gap is the missing **v3** successor on `@aws-sdk/*`, not lack of appetite for a mapper.



### H. Community libraries vs proposed first-party mapper (illustrative matrix)


| Dimension                              | Proposed @aws-sdk/lib-dynamodb-data-mapper                         | ElectroDB                               | DynamoDB-Toolbox                  | Dynamoose                     |
| -------------------------------------- | ------------------------------------------------------------------ | --------------------------------------- | --------------------------------- | ----------------------------- |
| Ownership                              | AWS; ships with the JavaScript SDK family                          | Community                               | Community                         | Community                     |
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
| 2    | ElectroDB             | Moderate: v3 docs center `DynamoDBClient`; need formal `DynamoDBDocumentClient` matrix | Partial: access-pattern-first vs neutral table-per-entity | Medium                 | Moderate                                   |
| 3    | Dynamoose             | Weak: service-style `ddb` config vs `send(Command)` everywhere                         | Farthest: Mongoose-like document models                   | Low for Mongoose users | Weakest                                    |


**K.3 How each library maps to the reference design**


| Library          | Closest match to reference design                                | Where it diverges                                                                               |
| ---------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| DynamoDB-Toolbox | Entity + Table + schema validation, emitting AWS SDK commands    | Richer validation/transforms than v1 promises; single-table is a strength, not mandatory        |
| ElectroDB        | Entity model + indexes + composite templates, bound to one table | Access-pattern-first APIs; fluent `.patch()… .go()`; library metadata on items (e.g. `__edb_`*) |
| Dynamoose        | Schema + `model()` giving typed-ish documents                    | Documented path is service-style `ddb` configuration, not `send(Command)` everywhere            |


**K.4 Deep comparison axes**

- **Integration with the document’s wire stack** — Toolbox expects the same peer packages and command-first examples. ElectroDB officially documents v3 with `DynamoDBClient`; an acquisition program needs a supported `DynamoDBDocumentClient` matrix. Dynamoose is closest to the low-level client service class, not `DynamoDBDocumentClient` as the primary abstraction in this document.
- **50/50 single-table vs multi-table** — ElectroDB markets single-table design; Toolbox and Dynamoose are more table-centric / neutral for multi-table teams.
- **Learning curve** — Toolbox rewards strict TypeScript; ElectroDB adds access-pattern vocabulary; Dynamoose is gentle for Mongoose immigrants.
- **Could AWS ship it as @aws-sdk/*?** — Toolbox: fewest architectural surprises when renamed and in-tree. ElectroDB: ship-able with program cost to neutralize positioning and formalize DocumentClient. Dynamoose: ship-able only with heavy engineering toward command-centric paths.

**K.5 v1 capability parity and effort (qualitative)**


| v1 theme                                           | Greenfield        | DynamoDB-Toolbox                 | ElectroDB                               | Dynamoose              |
| -------------------------------------------------- | ----------------- | -------------------------------- | --------------------------------------- | ---------------------- |
| Additive DynamoDBDocumentClient only               | Large             | Parity; small packaging          | Gap: medium–large for DocumentClient CI | Gap: large–extra-large |
| Schema-first API (defineSchema / forTable)         | Extra-large       | Parity; medium rename/subset     | Medium–large to neutralize ST defaults  | Medium–large reshape   |
| Primary index typed CRUD/query                     | Large             | Parity; small–medium             | Parity; small–medium                    | Parity; small–medium   |
| GSI/LSI explicit IndexName query                   | Large–extra-large | Parity; medium                   | Strong parity; small–medium             | Parity; medium         |
| Expression / pagination / batch / locking / errors | Medium–large each | Mostly parity; small–medium gaps | Mostly parity; medium product cost      | Partial; medium–large  |


**Net effort (indicative):** Greenfield and adopt-Toolbox both **large–extra-large** with different work (capability vs governance/rename). Adopt ElectroDB or Dynamoose is **extra-large** if strict `DynamoDBDocumentClient.send(Command)` is mandatory everywhere.

**K.6 Decision pull-through**

Default program: **greenfield** aligned to this document’s reference design (max API control, IP/release clarity, v3 tenets). Acquisition-style paths (e.g. Toolbox) deserve review only if leadership prioritizes time-to-first-supported-release and accepts license, renaming, API subsetting, and long-term maintenance of concepts AWS did not originate. Rebranding a third-party library as `@aws-sdk/`* requires legal, OSS compliance, and product sign-off on roadmap ownership, breaking-change policy, and support liability.



### PoC micro-benchmark

We evaluated four DynamoDB access layers (raw AWS SDK v3 `DynamoDBDocumentClient`, DynamoDB Toolbox, ElectroDB, and Dynamoose) against a single DynamoDB table with a fixed pk/sk key schema and a shared item shape. Each stack runs in its own AWS Lambda (`CSM_aws-sdk-js-v3_StackBenchPut_{raw,toolbox,electrodb,dynamoose}`, Node.js 20.x, 4096 MB, 900s timeout); the four Lambdas are invoked sequentially so stack timings are isolated.

Each Lambda runs a time-bounded PutItem-only phase: one untimed primer, then warmup puts, then measured puts. The loop is strictly sequential (one `await` per iteration). Keys spread across 16 shards by default to avoid hot-partition throttling. For each measured put we publish `PutLatency` (ms) to CloudWatch in namespace `aws-sdk-js-v3` with dimensions `ClientType=StackBench`, `Stack`, `Size`, `OperationName=PutItem`, `Platform=lambda`.

**Representative result (eu-west-1, Size=Small, Platform=lambda):** raw ≈ 4.8 ms; ElectroDB ≈ 4.9 ms (~~+2% vs raw); DynamoDB Toolbox ≈ 5.2 ms (~~+8% vs raw); Dynamoose ≈ 6.3 ms (~+31% vs raw). Service-side time is effectively constant across stacks (except Dynamoose’s bridge path); ordering reflects client-side mapping cost. Full methodology in the [PoC micro-benchmark](#appendix-poc) appendix source.



### Program plan (product engineering)

For AWS program leadership (quarterly planning, resourcing, go/no-go gates). Scope: **cross-SDK ODM program** governance (charter and roadmap only) plus **committed JavaScript Phase 0–5** (design through GA, automated tests, developer documentation, perf CI gates). Other languages are out of scope for resourcing in this plan except as willingness noted in the main document. Not gated on other Foundation proposals in this repository.

**Calendar anchor:** Program start **1 May 2026**; GA target **end of September 2026** (21 weeks engineering + buffer). Dates are planning baselines until staffing and formal gates are recorded.


| Name                           | Track       | Notes                                                       | Size | ECD        |
| ------------------------------ | ----------- | ----------------------------------------------------------- | ---- | ---------- |
| Design alignment (Phase 0)     | Governance  | Agree v1 scope and SDK vs DDB review owners (2 weeks)       | M    | 14/05/2026 |
| Private preview (Phase 1)      | Engineering | Installable build; primary-index CRUD; Local CI (6 weeks)   | XL   | 25/06/2026 |
| Perf CI (Phase 2)              | Engineering | Gates (3 weeks)                                             | —    | 16/07/2026 |
| Wider preview (Phase 3)        | Engineering | Docs, expressions, paging, batch, named GSI query (5 weeks) | XL   | 20/08/2026 |
| Release candidate (Phase 4)    | Release     | API freeze, migration guide, full matrix (3 weeks)          | L    | 10/09/2026 |
| Calendar buffer                | Program     | Release train slip absorption                               | —    | 16/09/2026 |
| General availability (Phase 5) | Release     | Supported package on normal AWS SDK cadence (2 weeks)       | M    | 30/09/2026 |


**Surface vs phase (summary)**


| Surface / v1 theme                                           | Phase 1                          | Phase 3                          | Phase 4          |
| ------------------------------------------------------------ | -------------------------------- | -------------------------------- | ---------------- |
| Core DataMapper (defineSchema, forTable, primary CRUD/query) | Required                         | Hardening + samples              | API freeze       |
| Expression / condition / update builders                     | Primary-path for Phase 1 updates | Modular surface; grow from usage | Stable for GA    |
| Pagination helpers                                           | Optional stub                    | Required for v1                  | Frozen           |
| Batch / transact utilities                                   | Out of Phase 1 gate              | Required minimal surface         | Frozen           |
| Explicit GSI/LSI typed query                                 | Out of Phase 1 gate              | Required for v1 intent           | Stable for GA    |
| Optimistic locking                                           | In scope when version declared   | Hardened docs/edge cases         | Frozen           |
| Error taxonomy (mapper vs service)                           | Draft for dogfood                | Written spec                     | Release-blocking |


**Risk register (short)**


| Risk                                                           | Likelihood | Impact | Mitigation                                                    |
| -------------------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------- |
| Smithy / codegen or middleware churn breaks mapper assumptions | Medium     | High   | Early spike; pin to release train branches with JS SDK owners |
| AWS merge policy or repo visibility delays integration         | Medium     | Medium | Pre-agree branch/PR policy; small mergeable increments        |
| GSI/LSI or expression-builder scope creep delays Phase 5       | High       | Medium | v1 scope as contract; change board after Phase 3 exit         |
| Preview API churn burns early adopters                         | Medium     | High   | Strict semver for preview channels; clear deprecation notes   |




### J. Estimation and priority labels

Definitions: **M** = medium (governance / ~~2 weeks); **L** = large (~~3 weeks); **XL** = extra-large (multi-week engineering track). Effort words in [Appendix K](#appendix-k) (small / medium / large / extra-large) use the same scale for relative sizing only—not person-months.

---

**Meeting notes:** None yet.