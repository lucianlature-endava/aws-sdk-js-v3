import type { AttributeDef, RowShape, SchemaDefLinked } from "../src/types/index";

/** Edit the model here; `satisfies` rejects invalid attribute defs. */
const userTableAttributes = {
  userId: { type: "string" as const },
  profileKey: { type: "string" as const },
  name: { type: "string" as const },
  email: { type: "string" as const },
  version: { type: "number" as const, versionAttribute: true },
} satisfies Record<string, AttributeDef>;

/**
 * Isolated schema object. `SchemaDefLinked` requires `composite` members to be keys of `userTableAttributes`
 * (e.g. a typo like `"userIdTypo"` in `composite` is a type error).
 */
export const userTableSchemaDefinition = {
  attributes: userTableAttributes,
  indexes: {
    primary: {
      pk: { field: "pk", composite: ["userId"] as const },
      sk: { field: "sk", composite: ["profileKey"] as const },
    },
  },
} satisfies SchemaDefLinked<typeof userTableAttributes>;

export type UserTableRow = RowShape<typeof userTableAttributes>;
