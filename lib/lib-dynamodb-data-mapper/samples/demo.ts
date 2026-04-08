/**
 * Local-first flow: create table, then put → get → update → query → delete.
 * Requires: docker compose up -d in this directory (DynamoDB Local on :8000)
 */

import { createLocalClients } from "../src/client";
import { ensureUserTable, userTableHandle } from "./user-table";

async function main() {
  const { ddbClient, docClient } = createLocalClients();
  await ensureUserTable(ddbClient);

  const UserTable = userTableHandle(docClient);

  await UserTable.put({
    userId: "user#123",
    profileKey: "profile",
    name: "Alice",
    email: "alice@example.com",
    version: 1,
  });
  console.log("put: ok");

  const got = await UserTable.get({ userId: "user#123", profileKey: "profile" });
  console.log("get:", got);

  await UserTable.update({ userId: "user#123", profileKey: "profile" }, { set: { name: "Bob", version: 2 } });
  console.log("update: ok");

  const after = await UserTable.get({ userId: "user#123", profileKey: "profile" });
  console.log("get after update:", after);

  const rows = await UserTable.query({ userId: "user#123" });
  console.log("query:", rows);

  await UserTable.delete({ userId: "user#123", profileKey: "profile" });
  console.log("delete: ok");

  const gone = await UserTable.get({ userId: "user#123", profileKey: "profile" });
  console.log("get after delete:", gone);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
