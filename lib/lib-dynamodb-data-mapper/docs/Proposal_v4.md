# Feature & operation matrix: JS Labs v2, Java Enhanced, Proposed v3 DataMapper


**Columns**


| Column            | Product                                                                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **JS v2**         | `@aws/dynamodb-data-mapper` (awslabs, frozen ~2019)                                                                                                                      |
| **Java Enhanced** | `software.amazon.awssdk:dynamodb-enhanced`                                                                                                                               |
| **Proposal v3**   | `@aws-sdk/lib-dynamodb-data-mapper`. **Target surface:** Java Enhanced parity where feasible on `DynamoDBDocumentClient` (schema remains function-based, not decorators) |


**Legend (all columns):** ✅ On mapper surface, ❌ Not on mapper, 🔶 Partial / escape hatch / app-level, 📋 Planned for preview/GA (not shipped yet), 🚫 Out of scope (none of the three), ⭕ Optional (not core GA: extension, separate package, or documented pattern)

**Proposal v3 column:** Use **📋** for every in-scope mapper feature (planned for preview/GA, nothing shipped yet). **✅** in this matrix applies to **JS v2** and **Java Enhanced** only. Use **❌** / **🔶** / **🚫** / **⭕** as in [§11](#11-not-on-mapper-surface-any-column) and [§12](#12-optional-layers-proposal-v3-only).


### What to use in reviews (do not infer from the repo spike)

| Document                                          | Use for                                                                                                                                                                  |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **This matrix (`Proposal_v4.md`)**                | Product scope: what Proposal v3 commits to ship (📋 = planned, not done).                                                                                                 |
| **`Proposal_v4_roadmap.md`**                      | When it ships (previews, GA).                                                                                                                                            |
| **`Proposal_v3.md`**                              | HLD rationale and governance narrative.                                                                                                                                  |
| **Code under `lib/lib-dynamodb-data-mapper/src`** | **Not authoritative for scope or schedule.** Early spike only. Type definitions for batch/transact/GSI/scan are design sketches and must not be read as “already built.” |

For repo vs commitment gap, see [`IMPLEMENTATION_STATUS.md`](./IMPLEMENTATION_STATUS.md).

---

## 1. Platform & packaging


| Feature / concern                                          | JS v2                     | Java Enhanced                            | Proposal v3                                                                     |
| ---------------------------------------------------------- | ------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------- |
| Ships in official SDK monorepo                             | ❌ (separate awslabs repo) | ✅ (`aws-sdk-java-v2`)                    | 📋 (`aws-sdk-js-v3` package)                                                     |
| Underlying AWS client                                      | `aws-sdk` v2 `DynamoDB`   | `DynamoDbClient` / `DynamoDbAsyncClient` | `DynamoDBDocumentClient` → `client-dynamodb`                                    |
| Sync API                                                   | ✅ (Promises)              | ✅                                        | 📋                                                                               |
| Async API                                                  | ✅ (`for await` iterators) | ✅ (`CompletableFuture`, `PagePublisher`) | 📋 `PagePublisher`-style async query/scan + table async variants                 |
| Maintenance status                                         | ❌ (archived ~2019)        | ✅ (active)                               | 📋 (in development, GA date from [roadmap](./Proposal_v4_roadmap.md), not fixed) |
| Modular sub-packages (expressions, batch, query iterators) | ✅ (7 npm packages)        | ❌ (single `dynamodb-enhanced` JAR)       | 📋 (core + expression/pagination/batch subpaths)                                 |
| Table name prefix                                          | ✅ `tableNamePrefix`       | 🔶 (per `table()` binding)                | 📋 optional prefix on `forTable` / factory                                       |
| Custom user-agent on client                                | ✅                         | 🔶 (SDK-wide)                             | 🔶 (inherits document client)                                                    |
| Escape hatch to low-level client                           | ✅ (injected v2 client)    | ✅ `dynamoDbClient()`                     | 📋 same `DynamoDBDocumentClient` instance                                        |


---

## 2. Schema & modeling


| Feature / concern                 | JS v2                                     | Java Enhanced                                       | Proposal v3                                                         |
| --------------------------------- | ----------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------- |
| Schema definition style           | Symbol `DynamoDbSchema` **or** decorators | Bean / `TableSchema.builder` / immutable / document | `defineSchema({ attributes, indexes })` (functions, not decorators) |
| Decorators / annotations required | 🔶 (optional package)                      | 🔶 (optional bean path)                              | ❌ (not required, not default)                                       |
| Partition (hash) key              | ✅                                         | ✅ `@DynamoDbPartitionKey`                           | 📋 `indexes.primary.pk`                                              |
| Sort (range) key                  | ✅                                         | ✅ `@DynamoDbSortKey`                                | 📋 `indexes.primary.sk`                                              |
| GSI / LSI key declarations        | ✅                                         | ✅ secondary key annotations / static tags           | 📋 under `indexes`, caller supplies `IndexName` on query             |
| Physical attribute rename         | ✅ `attributeName`                         | ✅ `@DynamoDbAttribute`                              | 📋 `field` on index legs / attribute metadata                        |
| Ignore property                   | 🔶 (omit from schema)                      | ✅ `@DynamoDbIgnore`                                 | 📋 omit from `attributes`                                            |
| Nested / document types           | ✅ `Document`, `embed()`, `Tuple`, `Map`   | ✅ `@DynamoDbFlatten`, `DocumentTableSchema`         | 📋 nested attributes + document-style schema (preview)               |
| Sets, maps, lists in schema       | ✅ `SchemaType` tags                       | ✅ via converters + schema                           | 📋 via converters / schema metadata (preview)                        |
| Auto-generated hash key (UUID)    | ✅ `@autoGeneratedHashKey`                 | ✅ `AutoGeneratedUuidExtension`                      | 📋 schema flag + write hook (Java parity)                            |
| Immutable domain models           | ✅ (static schema / symbols)               | 🔶 bean path: non-`final` fields                     | 📋 schema-on-plain-types / records                                   |
| Dynamic per-request table name    | ✅ getter on `DynamoDbTable`               | 🔶 patterns vary                                     | 🔶 static `tableName` per handle (v1), dynamic 📋 if demand           |
| Schema reuse / composition        | 🔶 manual                                  | ✅ `extend`, `flatten`                               | 📋 composable schema fragments                                       |
| Semi-structured / dynamic items   | 🔶 `Any`, `Collection`                     | ✅ `EnhancedDocument`, `DocumentTableSchema`         | 📋 document schema path (Java parity)                                |
| Custom type converters            | ✅ `Custom` + marshaller options           | ✅ `AttributeConverter` / `@DynamoDbConvertedBy`     | 📋 per-attribute converters (Java parity)                            |
| Multi-table on one mapper client  | ✅                                         | ✅ one enhanced client, many `table()`               | 📋 one `DataMapper` factory, many `forTable` handles                 |


### Nested and document types (detail for §2 rows)

DynamoDB items are attribute maps. **Nested data** is stored as **`M` (map)** and **`L` (list)** (and typed sets). The three columns differ in **how the mapper describes and marshals** that shape, not in whether DynamoDB supports JSON-like blobs.

| Pattern                            | Meaning                                                                  | JS v2 Labs                                                                                                                                                                                                   | Java Enhanced                                                                                                                                                                                             | Proposal v3 (planned)                                                                                                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Typed nested object on a row**   | A property is a structured sub-object still on **one item** (one PK/SK). | **`Document`** schema tag + **`embed(OtherClass)`** reuses another class’s schema. **`Map` / `Tuple`** tags for map/list/tuple shapes with schema children. Marshaller walks the tree into `AttributeValue`. | **`@DynamoDbFlatten`**: nested bean’s attributes are stored as **top-level** DynamoDB attributes on the same item (not a nested `M` wrapper). Inheritance + static `extend()` also flatten parent fields. | **`attributes` with nested schema** (object-typed fields) on `defineSchema`, marshalled through the document client. Keys/indexes stay explicit on the row schema. **Preview 5** (roadmap 5.2). |
| **Collections on a row**           | Sets, maps, lists of scalars or documents.                               | **`List`**, **`Set`**, **`Map`**, **`Collection`** `SchemaType` tags.                                                                                                                                        | Default converters + optional **`AttributeConverter`**.                                                                                                                                                   | Same row as matrix: **Preview 5** (roadmap 5.3), via schema metadata + converters (5.1).                                                                                                        |
| **Semi-structured / dynamic item** | Item shape varies or is not a fixed TS interface.                        | **`Any`**, loose **`Collection`** (partial).                                                                                                                                                                 | **`DocumentTableSchema`** + **`EnhancedDocument`**: schema built from items, read/write without a fixed bean.                                                                                             | Separate matrix row: **document schema path** (Java parity), also **Preview 5**. Not the default `forTable` product.                                                                            |

**Labs v2 schema tags vs Proposal v3 (commitment, not repo state):** Labs shipped a full marshaller tag set (`String`, `Number`, `Boolean`, `Binary`, `Date`, `Document`, `Map`, `List`, `Set`, `Tuple`, `Null`, `Any`, `Custom`, `Collection`, …). Proposal v3 does **not** drop those capabilities from the product plan: scalars and primary CRUD/query land in **Preview 1–2**, **binary + converters + nested/collection schema** in **Preview 5** (§2 matrix rows). The gap vs Labs is **schedule and packaging** (`defineSchema` + document client), not a permanent removal of DynamoDB types.

**Not document-ODM:** Nested attributes mean “this field is a map/list on **one DynamoDB item** with explicit PK/SK,” not “one nested JSON document replaces table design.” Multi-item aggregates (META + ITEM#n) remain explicit row types in schema, as in the HLD order example.

**References:** Labs types in [`aws-sdk-js-v2-reference.md`](./aws-sdk-js-v2-reference.md) §7.7. Java flatten and document schema in [`aws-sdk-java-v2-reference.md`](./aws-sdk-java-v2-reference.md) §7.6 and [Flatten attributes](https://docs.aws.amazon.com/sdk-for-java/latest/developer-guide/ddb-en-client-adv-features-flatmap.html), [`DocumentTableSchema`](https://docs.aws.amazon.com/java/api/latest/software/amazon/awssdk/enhanced/dynamodb/document/DocumentTableSchema.html).

---

## 3. Single-item operations


| Operation                                   | JS v2                       | Java Enhanced                           | Proposal v3                                                  |
| ------------------------------------------- | --------------------------- | --------------------------------------- | ------------------------------------------------------------ |
| **PutItem**                                 | ✅ `put`                     | ✅ `putItem`                             | 📋 `put`                                                      |
| **GetItem**                                 | ✅ `get` (throws if missing) | ✅ `getItem`                             | 📋 `get` (`undefined` if missing, optional strict error mode) |
| **UpdateItem** (from domain object)         | ✅ `update`                  | ✅ `updateItem`                          | 📋 `update` (partial / SET-style)                             |
| **UpdateItem** (raw update expression only) | ✅ `executeUpdateExpression` | ✅ `UpdateExpression` + enhanced request | 📋 update builders + escape hatch                             |
| **DeleteItem**                              | ✅ `delete`                  | ✅ `deleteItem`                          | 📋 `delete`                                                   |
| Condition on write/read                     | ✅ expression AST            | ✅ `Expression`                          | 📋 Condition builders (GA)                                    |
| Projection on read                          | ✅ `projection`              | ✅ on get/query/scan                     | 📋 Projection builder (Java parity)                           |
| Read consistency (strong / eventual)        | ✅ `readConsistency`         | ✅ on requests                           | 📋 per-operation option                                       |
| Return values on put                        | ❌                           | ✅ `putItemWithResponse`                 | 📋 `put` with response variant                                |
| Return values on delete                     | ✅ `returnValues`            | ✅ `deleteItemWithResponse`              | 📋 delete with response variant                               |
| `onMissing` for update (remove vs skip)     | ✅ `onMissing`               | 🔶 via update expression / item          | 📋 update modes aligned with Java                             |


---

## 4. Read operations (query, scan, pagination)


| Operation / concern                                   | JS v2            | Java Enhanced                         | Proposal v3                                           |
| ----------------------------------------------------- | ---------------- | ------------------------------------- | ----------------------------------------------------- |
| **Query** (table)                                     | ✅                | ✅ `DynamoDbTable.query`               | 📋                                                     |
| **Query** (GSI / LSI)                                 | ✅ `indexName`    | ✅ `table.index(name).query`           | 📋 typed query per index name                          |
| **Scan** (table)                                      | ✅ `scan`         | ✅ `scan`                              | 📋 `scan` on table handle (Java parity)                |
| **Scan** (index)                                      | ✅                | ✅ `DynamoDbIndex.scan`                | 📋 `scan` on index handle                              |
| **Parallel scan**                                     | ✅ `parallelScan` | 🔶 `segment` / `totalSegments` on scan | 📋 parallel scan helper or scan options (JS v2 + Java) |
| Item-at-a-time async iteration                        | ✅ `for await`    | ✅ via pages                           | 📋 `AsyncIterable` on query/scan                       |
| Page-level iteration                                  | ✅ `.pages()`     | ✅ `PageIterable` / `PagePublisher`    | 📋 pagination helpers + `iteratePages()`               |
| Iterator metadata (`count`, `scannedCount`, capacity) | ✅                | ✅                                     | 📋 on paginated results                                |
| `limit` / `pageSize` / `startKey`                     | ✅                | ✅                                     | 📋                                                     |
| `filter` expression                                   | ✅                | ✅                                     | 📋 filter via Condition builder                        |
| `scanIndexForward`                                    | ✅                | ✅                                     | 📋                                                     |


---

## 5. Batch operations


| Operation                                         | JS v2                                       | Java Enhanced                                   | Proposal v3                                |
| ------------------------------------------------- | ------------------------------------------- | ----------------------------------------------- | ------------------------------------------ |
| **BatchGetItem**                                  | ✅ `batchGet`                                | ✅ `batchGetItem` (paginator, unprocessed retry) | 📋 on table handle + multi-table helper     |
| **BatchWriteItem** (put/delete)                   | ✅ `batchPut` / `batchDelete` / `batchWrite` | ✅ `batchWriteItem`                              | 📋 `batchWrite` on handle + chunking helper |
| Auto-chunk to 25 / 100 limits                     | ✅                                           | ✅                                               | 📋                                          |
| Exponential backoff on unprocessed                | ✅                                           | ✅                                               | 📋                                          |
| Multi-table batch in one call                     | ✅                                           | ✅                                               | 📋 `DataMapper` / helper (Java parity)      |
| Per-table batch options (projection, consistency) | ✅ `perTableOptions`                         | 🔶                                               | 📋 per-table options on batch get           |


---

## 6. Transactions


| Operation                     | JS v2 | Java Enhanced          | Proposal v3                                             |
| ----------------------------- | ----- | ---------------------- | ------------------------------------------------------- |
| **TransactGetItems**          | ❌     | ✅ `transactGetItems`   | 📋 table handle + multi-table helper (Java parity)       |
| **TransactWriteItems**        | ❌     | ✅ `transactWriteItems` | 📋 `transactWrite` on handle + helper (Java parity)      |
| ConditionCheck in transaction | ❌     | ✅                      | 📋 `ConditionCheck` in typed `transactWrite` (Preview 3) |


---

## 7. Table & index lifecycle (control plane)


| Operation                              | JS v2           | Java Enhanced                      | Proposal v3                                                   |
| -------------------------------------- | --------------- | ---------------------------------- | ------------------------------------------------------------- |
| **CreateTable** (+ wait active)        | ✅ `createTable` | ✅ `createTable`                    | 📋 from schema metadata (Java parity, was out of v1 narrative) |
| **EnsureTableExists**                  | ✅               | 🔶 describe + create pattern        | 📋 `ensureTableExists` (Java + JS v2 parity)                   |
| **DeleteTable** (+ wait)               | ✅               | ✅ `deleteTable`                    | 📋 `deleteTable`                                               |
| **EnsureTableNotExists**               | ✅               | 🔶                                  | 📋 `ensureTableNotExists` (JS v2 parity)                       |
| **CreateGSI** / ensure GSI             | ✅               | ✅ via `CreateTableEnhancedRequest` | 📋 GSI/LSI on create / update (Java parity)                    |
| Billing mode / SSE / streams in create | ✅               | ✅ on create request                | 📋 on create options (Java parity)                             |


---

## 8. Expressions & update DSL


| Feature                       | JS v2                         | Java Enhanced                      | Proposal v3                                                      |
| ----------------------------- | ----------------------------- | ---------------------------------- | ---------------------------------------------------------------- |
| Standalone expression package | ✅ `@aws/dynamodb-expressions` | ❌ (in-module)                      | 📋 optional expressions subpath                                   |
| Condition expression AST      | ✅                             | ✅ `Expression`, `QueryConditional` | 📋 Condition + Key builders (GA)                                  |
| Update expression AST         | ✅ `UpdateExpression`          | ✅ `UpdateExpression` DSL           | 📋 Update builder (GA)                                            |
| Key condition for Query       | ✅                             | ✅ `QueryConditional`               | 📋 Key builder (GA)                                               |
| Function / math expressions   | ✅                             | 🔶 via `Expression`                 | 📋 subset in builders (JS v2 parity where needed)                 |
| Projection expression builder | ✅                             | ✅ on requests                      | 📋 Projection builder (Java parity, was deferred in v1 narrative) |
| Schema-aware name mapping     | ✅ marshall helpers            | ✅ via `TableSchema`                | 📋 via `defineSchema`                                             |
| Attribute path helper         | ✅ `AttributePath`             | 🔶 implicit in schema               | 📋 builder paths from schema keys                                 |


---

## 9. Optimistic locking, hooks, extensions


| Feature                                | JS v2                      | Java Enhanced                             | Proposal v3                                                |
| -------------------------------------- | -------------------------- | ----------------------------------------- | ---------------------------------------------------------- |
| Optimistic locking (version attribute) | ✅ `@versionAttribute`      | ✅ `VersionedRecordExtension`              | 📋 `versionAttribute: true`                                 |
| Skip version check per call            | ✅ `skipVersionCheck`       | 🔶 extension override                      | 📋 per-call flag                                            |
| Lifecycle hooks (before write)         | ❌ no hooks on `DataMapper` | ✅ `DynamoDbEnhancedClientExtension`       | 📋 `beforePut` / extension SPI (Java parity)                |
| Atomic counter on attribute            | ❌                          | ✅ `AtomicCounterExtension`                | 📋 schema metadata + extension (Java parity)                |
| Auto timestamps (created/updated)      | 🔶 `defaultProvider`        | ✅ `AutoGeneratedTimestampRecordExtension` | 📋 schema metadata + extension (Java parity)                |
| Auto UUID generation                   | ✅ `@autoGeneratedHashKey`  | ✅ `AutoGeneratedUuidExtension`            | 📋 schema metadata + extension (Java parity)                |
| Pluggable extension chain              | ❌                          | ✅ `extensions(...)` on builder            | 📋 ordered extensions on `DataMapper` / table (Java parity) |
| Write-if-not-exists semantics          | ✅ via `condition`          | ✅ `@DynamoDbUpdateBehavior`               | 📋 via condition / update behavior metadata                 |


---

## 10. Errors & observability


| Feature                                          | JS v2                                       | Java Enhanced              | Proposal v3                                               |
| ------------------------------------------------ | ------------------------------------------- | -------------------------- | --------------------------------------------------------- |
| Dedicated “item not found” error on get          | ✅ `ItemNotFoundException`                   | 🔶 caller checks null/empty | 🔶 default `undefined`, optional `ItemNotFoundError` 📋     |
| Schema validation errors                         | ✅ `InvalidSchemaError`, `InvalidValueError` | 🔶 mapping exceptions       | 📋 distinct mapper validation error type                   |
| Service errors (throttling, conditional failure) | ✅ AWS SDK v2                                | ✅ `SdkException`           | 📋 unchanged passthrough                                   |
| Dirty-field / change tracking                    | 🔶 unused                                    | ❌                          | ⭕ optional extension only, not default `save()` semantics |


---

## 11. Not on mapper surface (any column)


| Capability                                           | JS v2 | Java Enhanced | Proposal v3                                                                                                                             |
| ---------------------------------------------------- | ----- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| PartiQL                                              | ❌     | ❌             | ❌ (escape hatch: `ExecuteStatement` on document/low-level client)                                                                       |
| **DynamoDB Streams mapping** (CDC → domain events)   | ❌     | ❌             | ❌ (use stream client / Lambda, see [Terms](#terms-used-in-11))                                                                          |
| TTL API helpers                                      | ❌     | ❌             | 🔶 escape hatch                                                                                                                          |
| DAX integration                                      | ❌     | ❌             | 🚫                                                                                                                                       |
| Relational / join abstraction                        | ❌     | ❌             | ❌                                                                                                                                       |
| **Automatic GSI routing** (mapper picks `IndexName`) | ❌     | ❌             | 🚫 (explicit `IndexName` + key condition, see [Terms](#terms-used-in-11))                                                                |
| Prescribed single-table framework                    | ❌     | ❌             | 🚫 No single-table framework in API. Single-table **and** multi-table layouts OK with explicit schema (docs/examples only, not enforced) |


---

## 12. Optional layers (Proposal v3 only)

Not part of **core** `@aws-sdk/lib-dynamodb-data-mapper` GA. May be documented patterns, extensions, or a **separate package** if demand appears after GA.


| Capability                                 | JS v2                                      | Java Enhanced | Proposal v3                                                                                                                                                                                                                                                                                     |
| ------------------------------------------ | ------------------------------------------ | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Document-ODM** surface                   | ❌ (Labs is Data Mapper)                    | ❌             | ⭕ **Optional, not default.** Core remains Data Mapper (`defineSchema`, explicit keys/indexes). ODM-style `Model.get` / `doc.save()` / nested-single-item aggregates go to community libs (Dynamoose, etc.) or a **future opt-in** package. Avoids “Mongo-ifying” DynamoDB on the official path. |
| **Dirty tracking** / implicit partial save | 🔶 `DynamoDbDirtyFields` symbol, **unused** | ❌             | ⭕ **Optional, not default.** GA updates stay **explicit** (`update` with patch / Update builder / hooks such as `beforePut`). Dirty graphs only via opt-in extension or app-level wrapper, not Active Record `save()` of a mutated entity.                                                      |


---

## 13. Summary scorecard (mapper surface)

Rough **📋** coverage vs Java Enhanced (section 3–7 rows, Proposal v3 = planned, not shipped):


| Area                                            | JS v2   | Java Enhanced | Proposal v3 (Java-aligned target) |
| ----------------------------------------------- | ------- | ------------- | --------------------------------- |
| Single-item CRUD                                | 5/5 ✅   | 5/5 ✅         | 5/5 📋                             |
| Query + GSI/LSI                                 | ✅       | ✅             | 📋                                 |
| Scan + index scan                               | ✅       | ✅             | 📋                                 |
| Parallel scan                                   | ✅       | 🔶             | 📋                                 |
| Batch                                           | ✅       | ✅             | 📋 (helpers + handle)              |
| Transactions                                    | ❌       | ✅             | 📋                                 |
| Table lifecycle                                 | ✅       | ✅             | 📋                                 |
| Extensions (version, counter, UUID, timestamps) | partial | ✅             | 📋                                 |
| First-party maintenance                         | ❌       | ✅             | 📋                                 |


**Net:** Proposal v3 target is **parity with Java Enhanced** on operations and cross-cutting mapper features, while keeping **schema-as-code** (not annotations) and **Data Mapper as the default product** (document-ODM and dirty tracking **optional**, not core).