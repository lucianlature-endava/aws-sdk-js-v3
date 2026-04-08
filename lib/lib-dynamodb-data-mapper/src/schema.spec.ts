/**
 * Composite key behavior aligned with other AWS SDKs’ enhanced/document patterns;
 * this package joins `composite` fields into one stored `pk` / `sk` string with `#`.
 */

import { describe, expect, it } from "vitest";

import { defineSchema, partitionKeyValueFromRow, physicalKeyFromParts, physicalKeyFromRow } from "./schema";

const multiCompositeSchema = defineSchema({
  attributes: {
    tenantId: { type: "string" },
    userId: { type: "string" },
    sort: { type: "string" },
    n1: { type: "number" },
    n2: { type: "number" },
  },
  indexes: {
    primary: {
      pk: { field: "pk", composite: ["tenantId", "userId"] as const },
      sk: { field: "sk", composite: ["sort"] as const },
    },
  },
});

describe("physicalKeyFromRow", () => {
  it("joins composite pk and sk in declaration order", () => {
    const row = {
      tenantId: "acme",
      userId: "user-1",
      sort: "PROFILE",
      n1: 0,
      n2: 0,
    };
    expect(physicalKeyFromRow(multiCompositeSchema, row)).toEqual({
      pk: "acme#user-1",
      sk: "PROFILE",
    });
  });

  it("stringifies numeric key parts", () => {
    const schema = defineSchema({
      attributes: {
        pk1: { type: "number" },
        pk2: { type: "number" },
        sk1: { type: "number" },
      },
      indexes: {
        primary: {
          pk: { field: "pk", composite: ["pk1", "pk2"] as const },
          sk: { field: "sk", composite: ["sk1"] as const },
        },
      },
    });
    expect(physicalKeyFromRow(schema, { pk1: 123, pk2: 45.6, sk1: 7 })).toEqual({
      pk: "123#45.6",
      sk: "7",
    });
  });
});

describe("partitionKeyValueFromRow", () => {
  it("matches pk half of physicalKeyFromRow", () => {
    const part = { tenantId: "t", userId: "u" };
    expect(partitionKeyValueFromRow(multiCompositeSchema, part)).toEqual(
      physicalKeyFromRow(multiCompositeSchema, { ...part, sort: "x" }).pk
    );
  });
});

describe("physicalKeyFromParts", () => {
  it("matches physicalKeyFromRow for the same key fields", () => {
    const full = { tenantId: "a", userId: "b", sort: "c", n1: 1, n2: 2 };
    expect(physicalKeyFromParts(multiCompositeSchema, full)).toEqual(physicalKeyFromRow(multiCompositeSchema, full));
  });
});
