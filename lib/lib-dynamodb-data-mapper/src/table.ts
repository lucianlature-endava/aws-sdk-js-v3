/**
 * Typed table handle: maps **application row shape** ↔ DynamoDB items via `DynamoDBDocumentClient`.
 *
 * Writes merge logical attributes with computed `pk`/`sk` from the schema. Reads strip those
 * stored key attributes so callers see only `attributes`. Targets the **base table primary index**
 * only (no GSI/LSI `IndexName` or alternate key conditions yet).
 */
import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

import { partitionKeyValueFromRow, physicalKeyFromParts, physicalKeyFromRow } from "./schema";
import type { ForTableOptions, KeyInput, RowShape, SchemaDef, TableHandle } from "./types/index";

export type { ForTableOptions, TableHandle } from "./types/index";

/** Removes stored `pk`/`sk` attribute names from a loaded item so the result matches `RowShape`. */
function stripPhysicalKeys<S extends SchemaDef>(schema: S, item: Record<string, unknown>): Record<string, unknown> {
  const { field: pkField } = schema.indexes.primary.pk;
  const { field: skField } = schema.indexes.primary.sk;
  const rest = { ...item };
  delete rest[pkField];
  delete rest[skField];
  return rest;
}

/**
 * Binds `tableName` + `schema` to a `DynamoDBDocumentClient`, returning typed CRUD + query helpers.
 */
export function forTable<S extends SchemaDef>(
  tableName: string,
  schema: S,
  { client }: ForTableOptions
): TableHandle<S> {
  const pkField = schema.indexes.primary.pk.field;
  const skField = schema.indexes.primary.sk.field;

  return {
    async put(item: RowShape<S["attributes"]>) {
      const row = item as Record<string, unknown>;
      const keyAttrs = physicalKeyFromRow(schema, row);
      await client.send(
        new PutCommand({
          TableName: tableName,
          Item: { ...row, ...keyAttrs },
        })
      );
    },

    async get(key: KeyInput<S["attributes"], S["indexes"]["primary"]>) {
      const keyAttrs = physicalKeyFromParts(schema, key as Record<string, unknown>);
      const out = await client.send(
        new GetCommand({
          TableName: tableName,
          Key: keyAttrs,
        })
      );
      if (!out.Item) return undefined;
      return stripPhysicalKeys(schema, out.Item as Record<string, unknown>) as RowShape<S["attributes"]>;
    },

    async update(
      key: KeyInput<S["attributes"], S["indexes"]["primary"]>,
      opts: { set: Partial<RowShape<S["attributes"]>> }
    ) {
      const keyAttrs = physicalKeyFromParts(schema, key as Record<string, unknown>);
      const names: Record<string, string> = {};
      const values: Record<string, unknown> = {};
      const sets: string[] = [];
      let i = 0;

      for (const [attr, val] of Object.entries(opts.set)) {
        if (attr === pkField || attr === skField) {
          throw new Error(`Cannot update key attribute ${attr} via this update path`);
        }
        const nk = `#n${i}`;
        const vk = `:v${i}`;
        names[nk] = attr;
        values[vk] = val;
        sets.push(`${nk} = ${vk}`);
        i++;
      }

      if (sets.length === 0) return;

      await client.send(
        new UpdateCommand({
          TableName: tableName,
          Key: keyAttrs,
          UpdateExpression: "SET " + sets.join(", "),
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: values,
        })
      );
    },

    async delete(key: KeyInput<S["attributes"], S["indexes"]["primary"]>) {
      const keyAttrs = physicalKeyFromParts(schema, key as Record<string, unknown>);

      await client.send(
        new DeleteCommand({
          TableName: tableName,
          Key: keyAttrs,
        })
      );
    },

    /**
     * Query base table with `KeyConditionExpression` `#pk = :pk` (partition equality only).
     * Sort key is not part of the condition; all items under the partition are returned.
     */
    async query(partition: Pick<RowShape<S["attributes"]>, S["indexes"]["primary"]["pk"]["composite"][number]>) {
      const part = partition as Record<string, unknown>;
      const pkVal = partitionKeyValueFromRow(schema, part);
      const out = await client.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: "#pk = :pk",
          ExpressionAttributeNames: { "#pk": pkField },
          ExpressionAttributeValues: { ":pk": pkVal },
        })
      );
      const items = out.Items ?? [];

      return items.map((it) => stripPhysicalKeys(schema, it as Record<string, unknown>) as RowShape<S["attributes"]>);
    },
  };
}

/** Namespace-style entry point; use `DataMapper.forTable` like the public proposal. */
export const DataMapper = {
  forTable: forTable,
};
