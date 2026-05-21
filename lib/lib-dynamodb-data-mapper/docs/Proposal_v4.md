# Feature & operation matrix: JS Labs v2, Java Enhanced, Proposed v3 DataMapper

**Sources:** `[aws-sdk-js-v2-reference.md](./aws-sdk-js-v2-reference.md)`, `[aws-sdk-java-v2-reference.md](./aws-sdk-java-v2-reference.md)`

**Columns**


| Column            | Product                                                                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **JS v2**         | `@aws/dynamodb-data-mapper` (awslabs, frozen ~2019)                                                                                                                      |
| **Java Enhanced** | `software.amazon.awssdk:dynamodb-enhanced`                                                                                                                               |
| **Proposal v3**   | `@aws-sdk/lib-dynamodb-data-mapper`. **Target surface:** Java Enhanced parity where feasible on `DynamoDBDocumentClient` (schema remains function-based, not decorators) |


**Legend (all columns):** ✅ On mapper surface, ❌ Not on mapper, 🔶 Partial / escape hatch / app-level, 📋 Planned for preview/GA (not shipped yet), 🚫 Out of scope (none of the three), ⭕ Optional (not core GA: extension, separate package, or documented pattern)

**Proposal v3 column:** Use **📋** for every in-scope mapper feature (planned for preview/GA, nothing shipped yet). **✅** in this matrix applies to **JS v2** and **Java Enhanced** only. Use **❌** / **🔶** / **🚫** / **⭕** as in [§11](#11-not-on-mapper-surface-any-column) and [§12](#12-optional-layers-proposal-v3-only).


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


| Operation                     | JS v2 | Java Enhanced          | Proposal v3                                                                  |
| ----------------------------- | ----- | ---------------------- | ---------------------------------------------------------------------------- |
| **TransactGetItems**          | ❌     | ✅ `transactGetItems`   | 📋 table handle + multi-table helper (Java parity)                            |
| **TransactWriteItems**        | ❌     | ✅ `transactWriteItems` | 📋 `transactWrite` on handle + helper (Java parity)                           |
| ConditionCheck in transaction | ❌     | ✅                      | 📋 `ConditionCheck` in typed `transactWrite` (Preview 3, not implemented yet) |


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