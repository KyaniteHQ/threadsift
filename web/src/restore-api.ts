import {
  type RestoreErrorCode,
  RestoreErrorSchema,
  RestoreStatusSchema,
  StartedRestoreSchema,
} from "../../src/core/restore-contract.ts";
import { NO_DEADLINE, call, callOk, parsedBody, parsedFrom, post, put } from "./calls.ts";
import { DATABASE_WRITE_DEADLINE_MS } from "./write-deadlines.ts";

const ENDPOINT = "/api/restore";

export type Refused = Readonly<{ kind: "refused"; code: RestoreErrorCode }>;

export function fetchRestoreStatus(signal?: AbortSignal) {
  return parsedFrom("GET", ENDPOINT, RestoreStatusSchema, { signal });
}

async function refusalOf(response: Response): Promise<Refused> {
  const { code } = await parsedBody(response, RestoreErrorSchema);

  if (code === undefined) throw new Error(`${ENDPOINT} refused without a code`);

  return { kind: "refused", code };
}

export async function createRestore(
  bytes: number,
  parts: number,
): Promise<Readonly<{ kind: "created"; id: number; partBytes: number }> | Refused> {
  const response = await callOk(post(DATABASE_WRITE_DEADLINE_MS), ENDPOINT, {
    json: { bytes, parts },
    tolerates: [409],
  });

  if (response.status === 409) return refusalOf(response);

  return { kind: "created", ...(await parsedBody(response, StartedRestoreSchema)) };
}

export async function sendPart(id: number, part: number, bytes: Readonly<Blob>): Promise<void> {
  await callOk(put(NO_DEADLINE), `${ENDPOINT}/${String(id)}/parts/${String(part)}`, { bytes });
}

export async function startRestore(id: number): Promise<Readonly<{ kind: "started" }> | Refused> {
  const response = await call(post(NO_DEADLINE), `${ENDPOINT}/${String(id)}/start`);

  if (response.ok) return { kind: "started" };

  if (response.status === 400 || response.status === 409) return refusalOf(response);

  throw new Error(`POST ${ENDPOINT}/${String(id)}/start answered ${String(response.status)}`);
}
