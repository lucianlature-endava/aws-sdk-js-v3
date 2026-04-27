/**
 * Seed UserTable on DynamoDB Local. Idempotent: overwrites same keys via put.
 * Requires: docker compose up -d in this directory
 */
import { createLocalClients } from "../src/client";
import { ensureUserTable, userTableHandle } from "./user-table";

const SEED_ROWS = [
  {
    userId: "user#seed-1",
    profileKey: "profile",
    name: "Ada Lovelace",
    email: "ada@example.com",
    body: "",
    version: 1,
  },
  {
    userId: "user#seed-1",
    profileKey: "settings",
    name: "Ada (settings row)",
    email: "ada-settings@example.com",
    body: "",
    version: 1,
  },
  {
    userId: "user#seed-2",
    profileKey: "profile",
    name: "Alan Turing",
    email: "alan@example.com",
    body: "",
    version: 1,
  },
  {
    userId: "user#seed-3",
    profileKey: "profile",
    name: "Grace Hopper",
    email: "grace@example.com",
    body: "",
    version: 1,
  },
] as const;

async function main() {
  const { ddbClient, docClient } = createLocalClients();
  await ensureUserTable(ddbClient);

  const UserTable = userTableHandle(docClient);
  for (const row of SEED_ROWS) {
    await UserTable.put({ ...row });
    console.log("Seeded:", row.userId, row.profileKey);
  }
  console.log("Seed complete:", SEED_ROWS.length, "items");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
