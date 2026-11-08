import { z } from "zod";

const StatusLine = z.object({ event: z.literal("fetch-status"), httpStatus: z.number() }).strict();

export function fetchStatusCodes(logs: string): number[] {
  return [...logs.matchAll(/\{"event":"fetch-status"[^}]*\}/gu)].map(
    ([line = ""]) => StatusLine.parse(JSON.parse(line)).httpStatus,
  );
}
