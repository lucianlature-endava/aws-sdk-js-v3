/**
 * Print tables and a document scan of UserTable on DynamoDB Local (sanity check vs GUI tools).
 */
import { ListTablesCommand } from "@aws-sdk/client-dynamodb";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { createLocalClients } from "../src/client";
import { USER_TABLE_NAME } from "./user-table";

async function main() {
  const { ddbClient, docClient } = createLocalClients();

  const listed = await ddbClient.send(new ListTablesCommand({}));
  console.log("Tables on this endpoint:", listed.TableNames?.length ? listed.TableNames : "(none)");

  if (!listed.TableNames?.includes(USER_TABLE_NAME)) {
    console.log(`\nNo "${USER_TABLE_NAME}" here. Run: yarn sample:seed`);
    return;
  }

  const out = await docClient.send(new ScanCommand({ TableName: USER_TABLE_NAME }));
  const items = out.Items ?? [];
  console.log(`\nScan ${USER_TABLE_NAME} (${items.length} items):`);
  console.dir(items, { depth: null });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
