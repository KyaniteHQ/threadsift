import type { RestoreRefusal } from "../../../core/contract/restore-contract.ts";
import { type ZipFault, ZipRefused } from "../../export/core/zip-read.ts";

export class RestoreRefused extends Error {
  readonly code: RestoreRefusal;

  constructor(code: RestoreRefusal, message: string) {
    super(message);
    this.code = code;
  }
}

const REFUSAL_OF_FAULT: Readonly<Record<ZipFault, RestoreRefusal>> = {
  malformed: "not-a-zip",
  "unsupported-method": "unsupported-compression",
  "bad-name": "bad-entry-name",
  "bad-checksum": "crc",
};

export function restoreRefusalOf(cause: unknown): RestoreRefusal | null {
  if (cause instanceof RestoreRefused) return cause.code;

  return cause instanceof ZipRefused ? REFUSAL_OF_FAULT[cause.fault] : null;
}
