import { type LogPage, LogPageSchema } from "../../src/core/log-contract.ts";
import { parsedFrom, withCursor } from "./calls.ts";

export function fetchLog(cursor: string | null): Promise<LogPage> {
  return parsedFrom("GET", withCursor("/api/log", cursor), LogPageSchema);
}
