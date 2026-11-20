import { ExportStatusSchema } from "../../src/core/contract/export-contract.ts";
import { callOk, del, parsedFrom, post } from "./calls.ts";
import { DATABASE_WRITE_DEADLINE_MS } from "./write-deadlines.ts";

const ENDPOINT = "/api/export";

export function exportDownloadAddress(id: number): string {
  return `${ENDPOINT}/${String(id)}/download`;
}

export function fetchExportStatus(signal?: AbortSignal) {
  return parsedFrom("GET", ENDPOINT, ExportStatusSchema, { signal });
}

export async function startExport(): Promise<void> {
  await callOk(post(DATABASE_WRITE_DEADLINE_MS), ENDPOINT, { tolerates: [409] });
}

export async function deleteExport(): Promise<void> {
  await callOk(del(DATABASE_WRITE_DEADLINE_MS), ENDPOINT, { tolerates: [404] });
}
