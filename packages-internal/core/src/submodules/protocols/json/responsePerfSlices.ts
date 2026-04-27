/**
 * Gated micro-profiling for large JSON responses (DynamoDB Query/Scan, etc.).
 * Enable with env `AWS_SDK_PERF_RESPONSE_SLICES=1`. Results on `globalThis.__AWS_SDK_RESPONSE_PERF_SLICES__`.
 *
 * @internal
 */
const KEY = "__AWS_SDK_RESPONSE_PERF_SLICES__" as const;

export type ResponsePerfSlicesState = {
  collect_body_ms: number;
  json_parse_ms: number;
  shape_deserialize_ms: number;
  document_unmarshall_ms: number;
};

export const perfSlicesEnabled = (): boolean => process.env.AWS_SDK_PERF_RESPONSE_SLICES === "1";

export const resetPerfSlices = (): void => {
  if (!perfSlicesEnabled()) return;
  (globalThis as unknown as Record<string, ResponsePerfSlicesState>)[KEY] = {
    collect_body_ms: 0,
    json_parse_ms: 0,
    shape_deserialize_ms: 0,
    document_unmarshall_ms: 0,
  };
};

export const recordSlice = (name: keyof ResponsePerfSlicesState, ms: number): void => {
  if (!perfSlicesEnabled()) return;
  const g = globalThis as unknown as Record<string, ResponsePerfSlicesState>;
  if (!g[KEY]) resetPerfSlices();
  g[KEY][name] = Number(ms.toFixed(3));
};
