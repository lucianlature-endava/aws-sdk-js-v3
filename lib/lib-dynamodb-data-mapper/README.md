# @aws-sdk/lib-dynamodb-data-mapper

Typed helpers for mapping application row shapes to DynamoDB items using `DynamoDBDocumentClient`.
This package builds on [`@aws-sdk/lib-dynamodb`](https://github.com/aws/aws-sdk-js-v3/tree/main/lib/lib-dynamodb).

## Install

```bash
npm install @aws-sdk/lib-dynamodb-data-mapper @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
```

## Usage

Define a schema with `defineSchema`, then bind a table with `DataMapper.forTable` (or `forTable`):

```typescript
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { defineSchema, DataMapper } from "@aws-sdk/lib-dynamodb-data-mapper";

const schema = defineSchema({
  attributes: {
    tenantId: { type: "string" },
    sort: { type: "string" },
  },
  indexes: {
    primary: {
      pk: { field: "pk", composite: ["tenantId"] as const },
      sk: { field: "sk", composite: ["sort"] as const },
    },
  },
});

const table = DataMapper.forTable("MyTable", schema, { client: docClient });
await table.put({ tenantId: "a", sort: "x" /* ... */ });
```

## Samples (DynamoDB Local)

From `samples/`: `docker compose up -d`, then from the package root run `yarn sample:demo` (see `package.json` scripts).

## License

This project is licensed under the Apache-2.0 License.
