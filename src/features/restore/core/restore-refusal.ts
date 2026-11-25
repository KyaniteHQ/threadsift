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

export interface RefusalDetail {
  readonly code: RestoreRefusal;
  readonly message: string;
}

export function restoreRefusalOf(cause: unknown): RefusalDetail | null {
  if (cause instanceof RestoreRefused) return { code: cause.code, message: cause.message };

  return cause instanceof ZipRefused
    ? { code: REFUSAL_OF_FAULT[cause.fault], message: cause.message }
    : null;
}
