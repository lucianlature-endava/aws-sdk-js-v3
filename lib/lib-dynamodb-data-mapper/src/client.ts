import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

import type { LocalClients } from "./types/index";

export type { LocalClients } from "./types/index";

const LOCAL_ENDPOINT = process.env.DYNAMODB_ENDPOINT ?? "http://localhost:8000";

/**
 * Factory for demos against **DynamoDB Local**: low-level client + document client.
 *
 * - Endpoint: `DYNAMODB_ENDPOINT` or `http://localhost:8000`
 * - Region: `AWS_REGION` or `us-east-1`
 * - Credentials: env vars or placeholder `local` / `local` (sufficient for Local)
 *
 * Document client uses `removeUndefinedValues: true` so partial objects omit unset fields on write.
 */
export function createLocalClients(): LocalClients {
  const ddbClient = new DynamoDBClient({
    endpoint: LOCAL_ENDPOINT,
    region: process.env.AWS_REGION ?? "us-east-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "local",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "local",
    },
  });
  const docClient = DynamoDBDocumentClient.from(ddbClient, {
    marshallOptions: { removeUndefinedValues: true },
  });
  return { ddbClient, docClient };
}
