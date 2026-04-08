/**
 * Query path partition equality, built via `DataMapper.forTable().query()`.
 */

import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { describe, expect, it } from "vitest";

import { defineSchema } from "./schema";
import { DataMapper } from "./table";

describe("DataMapper.forTable().query", () => {
  it("uses KeyConditionExpression #pk = :pk with joined composite partition value", async () => {
    const schema = defineSchema({
      attributes: {
        tenantId: { type: "string" },
        userId: { type: "string" },
        sort: { type: "string" },
      },
      indexes: {
        primary: {
          pk: { field: "pk", composite: ["tenantId", "userId"] as const },
          sk: { field: "sk", composite: ["sort"] as const },
        },
      },
    });

    let queryInput: QueryCommand["input"] | undefined;
    const client = {
      send(command: unknown) {
        if (command instanceof QueryCommand) {
          queryInput = command.input;
          return Promise.resolve({ Items: [] });
        }
        return Promise.reject(new Error(`unexpected command: ${command?.constructor?.name}`));
      },
    } as unknown as DynamoDBDocumentClient;

    const table = DataMapper.forTable("TestTable", schema, { client });
    await table.query({ tenantId: "acme", userId: "u1" });

    expect(queryInput?.TableName).toBe("TestTable");
    expect(queryInput?.KeyConditionExpression).toBe("#pk = :pk");
    expect(queryInput?.ExpressionAttributeNames).toEqual({ "#pk": "pk" });
    expect(queryInput?.ExpressionAttributeValues).toEqual({ ":pk": "acme#u1" });
  });
});
