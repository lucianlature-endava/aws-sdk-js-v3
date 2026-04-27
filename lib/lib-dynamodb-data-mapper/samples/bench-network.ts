/**
 * Shared helpers for benchmark scripts that talk to **real AWS DynamoDB** (no custom endpoint).
 *
 * Credentials and region follow the AWS SDK default chain (`AWS_PROFILE`, env keys, SSO, instance role in prod).
 */
import { DynamoDB, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

/** Region for service clients and v2 DocumentClient wrappers. */
export function resolveBenchAwsRegion(env = process.env): string {
  const r = env.AWS_REGION?.trim() || env.AWS_DEFAULT_REGION?.trim();
  return r || "us-east-1";
}

export type BenchAwsClients = {
  ddbClient: DynamoDBClient;
  docClient: DynamoDBDocumentClient;
};

/** Low-level + document clients against the regional DynamoDB endpoint (production-like). */
export function createAwsBenchClients(env = process.env): BenchAwsClients {
  const region = resolveBenchAwsRegion(env);
  const ddbClient = new DynamoDBClient({ region });
  const docClient = DynamoDBDocumentClient.from(ddbClient, {
    marshallOptions: { removeUndefinedValues: true },
  });
  return { ddbClient, docClient };
}

/** Raw `DynamoDB` service client for Dynamoose (`ddb.putItem`, …). */
export function createAwsBenchDynamoService(env = process.env): DynamoDB {
  return new DynamoDB({ region: resolveBenchAwsRegion(env) });
}
