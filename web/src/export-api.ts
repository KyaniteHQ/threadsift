import { ExportStatusSchema } from "../../src/core/contract/export-contract.ts";
import { callOk, del, parsedFrom, post } from "./calls.ts";
import { isRestoring } from "./unavailable.ts";
import { DATABASE_WRITE_DEADLINE_MS } from "./write-deadlines.ts";

const ENDPOINT = "/api/export";

export function exportDownloadAddress(id: number): string {
  return `${ENDPOINT}/${String(id)}/download`;
}

export function fetchExportStatus(signal?: AbortSignal) {
  return parsedFrom("GET", ENDPOINT, ExportStatusSchema, { signal });
}

export async function startExport(): Promise<"started" | "restoring"> {
  const response = await callOk(post(DATABASE_WRITE_DEADLINE_MS), ENDPOINT, {
    tolerates: [409, 503],
  });

  if (await isRestoring(response)) return "restoring";

  if (response.status === 503) throw new Error("POST /api/export answered 503");

  return "started";
}

export async function deleteExport(): Promise<void> {
  await callOk(del(DATABASE_WRITE_DEADLINE_MS), ENDPOINT, { tolerates: [404] });
}
