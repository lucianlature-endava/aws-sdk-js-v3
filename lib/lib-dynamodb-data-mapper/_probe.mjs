import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";

const ddb = new DynamoDB({ endpoint: "http://127.0.0.1:1", region: "us-east-1", credentials: { accessKeyId: "x", secretAccessKey: "y" }, maxAttempts: 1 });
ddb.middlewareStack.add(
  (_n, ctx) => async (args) => {
    console.log("SHORT step=serialize ctx.clientName=", ctx.clientName, "features=", JSON.stringify(ctx?.__smithy_context?.features ?? null), "inputKeys=", Object.keys(args?.input ?? {}), "KeyShape=", JSON.stringify(args?.input?.Key ?? null));
    return { output: { Item: { pk: { S: "user#123" }, sk: { S: "profile" } }, $metadata: { httpStatusCode: 200 } }, response: {} };
  },
  { step: "serialize", name: "probeShort" }
);

const doc = DynamoDBDocumentClient.from(ddb);
console.log("--- via DOC ---");
const r1 = await doc.send(new GetCommand({ TableName: "T", Key: { pk: "user#123", sk: "profile" } }));
console.log("doc result:", JSON.stringify(r1));
console.log("--- via RAW ddb getItem ---");
const r2 = await ddb.getItem({ TableName: "T", Key: { pk: { S: "user#123" }, sk: { S: "profile" } } });
console.log("raw result:", JSON.stringify(r2));
