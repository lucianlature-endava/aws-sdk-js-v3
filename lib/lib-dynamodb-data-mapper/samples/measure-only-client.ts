/**
 * Shared builder for **measure-only** benches: returns a v3 **`DynamoDB`** whose `requestHandler`
 * never opens a socket. The handler inspects `X-Amz-Target` on each request and returns a canned
 * **DynamoDB JSON 1.0** body per operation, so the **entire** v3 middleware chain runs end-to-end
 * (serialize → sign/retry → deserialize) and **`DynamoDBDocumentClient`** on top still performs
 * `DocumentMarshall` / `DocumentUnmarshall`. Doc-client callers (**v3 doc**, **mapper**, **Toolbox**,
 * **ElectroDB**) receive unmarshalled plain-JS items; raw `DynamoDB.*Item(...)` callers (**Dynamoose**)
 * receive **`AttributeValue`**-shaped items. Used by both `micro-bench-comparison.ts` and
 * `minimal-query-bench.ts` to **kill RTT** so library overhead is legible.
 *
 * Minimal usage:
 *
 * ```ts
 * const av = userItemToAttributeMap({ pk, sk, userId, profileKey, name, email, body, version });
 * const fakeDdb = buildMeasureOnlySharedDynamoDb(av);
 * const docClient = DynamoDBDocumentClient.from(fakeDdb);
 * ```
 */
import type { AttributeValue } from "@aws-sdk/client-dynamodb";
import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { Readable } from "node:stream";

export const DEFAULT_MEASURE_ONLY_ENDPOINT = "http://localhost:8000";

export type MeasureOnlyBuildOptions = {
  /** Override fake endpoint URL (non-functional — no socket is opened; default: localhost:8000). */
  endpoint?: string;
  /** Region for signing; defaults to `AWS_REGION` or `us-east-1`. */
  region?: string;
  /** Credentials for signing; defaults to env or `local`/`local`. */
  credentials?: { accessKeyId: string; secretAccessKey: string };
  /**
   * Called with **nanoseconds spent inside the fake handler** (JSON stringify + stream) per request,
   * useful for breakdown harnesses. Skip for simple benches — overhead is a few hundred ns.
   */
  onHandlerNs?: (ns: bigint) => void;
};

type FakeHttpRequest = { headers: Record<string, string | undefined> };
type FakeHttpResponse = {
  statusCode: number;
  reason: string;
  headers: Record<string, string>;
  body: Readable;
};

/**
 * Returns a v3 **`DynamoDB`** whose `requestHandler` always responds with a canned JSON 1.0 body
 * derived from the operation in **`X-Amz-Target`**. `avItem` is the **`AttributeValue`**-shaped item
 * returned by `GetItem` / `UpdateItem.Attributes` / `Query.Items[0]` / `Scan.Items[0]`; `PutItem` and
 * `DeleteItem` return empty bodies (matching DynamoDB when no return attributes are requested).
 */
export function buildMeasureOnlySharedDynamoDb(
  avItem: Record<string, AttributeValue>,
  options: MeasureOnlyBuildOptions = {},
): DynamoDB {
  const onHandlerNs = options.onHandlerNs;

  const jsonBodyForOperation = (operation: string | undefined): Record<string, unknown> => {
    switch (operation) {
      case "GetItem":
        return { Item: avItem };
      case "UpdateItem":
        return { Attributes: avItem };
      case "Query":
        return { Items: [avItem], Count: 1, ScannedCount: 1 };
      case "Scan":
        return { Items: [avItem], Count: 1, ScannedCount: 1 };
      case "PutItem":
      case "DeleteItem":
      default:
        return {};
    }
  };

  const buildHttpResponse = (request: FakeHttpRequest): { response: FakeHttpResponse } => {
    const targetRaw = request.headers["X-Amz-Target"] ?? request.headers["x-amz-target"] ?? "";
    const operation = targetRaw.split(".").pop();
    const bodyBuf = Buffer.from(JSON.stringify(jsonBodyForOperation(operation)));
    return {
      response: {
        statusCode: 200,
        reason: "OK",
        headers: {
          "content-type": "application/x-amz-json-1.0",
          "content-length": String(bodyBuf.byteLength),
        },
        body: Readable.from([bodyBuf]),
      },
    };
  };

  const fakeRequestHandler = {
    handle: async (request: FakeHttpRequest): Promise<{ response: FakeHttpResponse }> => {
      if (!onHandlerNs) return buildHttpResponse(request);
      const t0 = process.hrtime.bigint();
      try {
        return buildHttpResponse(request);
      } finally {
        onHandlerNs(process.hrtime.bigint() - t0);
      }
    },
    destroy: () => undefined,
    updateHttpClientConfig: () => undefined,
    httpHandlerConfigs: () => ({}),
  };

  return new DynamoDB({
    endpoint: options.endpoint ?? DEFAULT_MEASURE_ONLY_ENDPOINT,
    region: options.region ?? process.env.AWS_REGION ?? "us-east-1",
    credentials: options.credentials ?? {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "local",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "local",
    },
    requestHandler: fakeRequestHandler as unknown as NonNullable<
      ConstructorParameters<typeof DynamoDB>[0]
    >["requestHandler"],
  });
}

/** Plain-JS user-table row shape shared by the benches (same keys as `UserTable`). */
export type UserTableLikeItem = {
  pk: string;
  sk: string;
  userId: string;
  profileKey: string;
  name: string;
  email: string;
  body: string;
  version: number;
};

/** Converts a user-table-shaped row to an `AttributeValue` map suitable for the fake handler. */
export function userItemToAttributeMap(i: UserTableLikeItem): Record<string, AttributeValue> {
  return {
    pk: { S: i.pk },
    sk: { S: i.sk },
    userId: { S: i.userId },
    profileKey: { S: i.profileKey },
    name: { S: i.name },
    email: { S: i.email },
    body: { S: i.body },
    version: { N: String(i.version) },
  };
}
