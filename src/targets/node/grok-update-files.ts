import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  access as accessFile,
  constants,
  link,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  utimes,
} from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { pipeline } from "node:stream/promises";

import { z } from "zod";

import { RefusedUpdateSchema } from "../../core/contract/x-settings-contract.ts";
import { errnoCodeOf, report, withCleanup } from "../../core/kernel/failure-log.ts";
import { parsedJson } from "../../core/kernel/parsed-json.ts";
import type { BinaryIdentity } from "./grok-folders.ts";

export const ATTEMPT_MS = 30 * 60_000;
const STALE_MS = ATTEMPT_MS + 5 * 60_000;
export const STAGING_PREFIX = ".threadsift-update-";

const StateSchema = z.object({
  checkedAt: z.number(),
  refused: RefusedUpdateSchema.nullable(),
});

export type UpdateState = z.output<typeof StateSchema>;

export interface Fingerprint {
  readonly size: number;
  readonly modifiedMs: number;
  readonly inode: number;
  readonly sha256: string;
}

async function setAside(file: string, code: string): Promise<null> {
  report("grok-update-state-unreadable", { code });

  await rename(file, `${file}.bad`).catch((cause: unknown) => {
    report("grok-update-state-unreadable", { code: errnoCodeOf(cause) });
  });

  return null;
}

export async function readState(file: string): Promise<UpdateState | null> {
  let text: string;

  try {
    text = await readFile(file, "utf8");
  } catch (cause) {
    return errnoCodeOf(cause) === "ENOENT" ? null : setAside(file, errnoCodeOf(cause));
  }

  return parsedJson(StateSchema, text) ?? setAside(file, "invalid");
}

export async function writeState(file: string, state: Readonly<UpdateState>): Promise<void> {
  const temporary = `${file}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "w");

  await withCleanup(
    { event: "grok-update-state-not-closed", fields: {} },
    async () => {
      await handle.writeFile(JSON.stringify(state));
      await handle.sync();
    },
    () => handle.close(),
  );
  await rename(temporary, file);
}

export function writable(folder: string): Promise<boolean> {
  return accessFile(folder, constants.W_OK).then(
    () => true,
    () => false,
  );
}

async function created(lock: string): Promise<boolean> {
  try {
    await (await open(lock, "wx")).close();

    return true;
  } catch (cause) {
    if (errnoCodeOf(cause) !== "EEXIST") throw cause;

    return false;
  }
}

async function linked(existing: string, name: string): Promise<"linked" | "taken" | "gone"> {
  try {
    await link(existing, name);

    return "linked";
  } catch (cause) {
    const code = errnoCodeOf(cause);

    if (code === "EEXIST") return "taken";

    if (code === "ENOENT") return "gone";

    throw cause;
  }
}

function touched(path: string): Promise<void> {
  const now = new Date();

  return utimes(path, now, now);
}

async function staleBreakTouched(tomb: string, now: number): Promise<false> {
  const breaking = await stat(tomb).catch(() => null);

  if (breaking !== null && now - breaking.ctimeMs >= STALE_MS) await touched(tomb);

  return false;
}

async function brokenStale(
  lock: string,
  stale: Readonly<{ ino: bigint; mtimeNs: bigint }>,
  now: number,
): Promise<boolean> {
  const tomb = `${lock}.${String(stale.ino)}-${String(stale.mtimeNs)}`;
  const outcome = await linked(lock, tomb);

  if (outcome === "taken") return staleBreakTouched(tomb, now);

  if (outcome === "gone") return false;

  return withCleanup(
    { event: "grok-update-lock-not-removed", fields: {} },
    async () => {
      if ((await stat(tomb, { bigint: true })).ino !== stale.ino) return false;

      await touched(tomb);
      await rm(lock, { force: true });

      return created(lock);
    },
    () => rm(tomb, { force: true }),
  );
}

export async function claimed(lock: string, now: number): Promise<boolean> {
  if (await created(lock)) return true;

  const held = await stat(lock, { bigint: true }).catch(() => null);

  if (held === null) return created(lock);

  if (now - Number(held.mtimeMs) < STALE_MS) return false;

  return brokenStale(lock, { ino: held.ino, mtimeNs: held.mtimeNs }, now);
}

export async function sweptStaging(folder: string, now: number): Promise<void> {
  const names = (await readdir(folder)).filter((name) => name.startsWith(STAGING_PREFIX));

  await Promise.all(
    names.map(async (name) => {
      const path = join(folder, name);
      const found = await stat(path).catch(() => null);

      if (found !== null && now - found.mtimeMs >= STALE_MS) {
        await rm(path, { recursive: true, force: true });
      }
    }),
  );
}

export async function candidateIn(staging: string): Promise<string | null> {
  const candidate = await realpath(join(staging, "bin", "grok")).catch(() => null);

  if (candidate === null) return null;

  const inside = relative(staging, candidate);

  return inside.startsWith("..") || isAbsolute(inside) ? null : candidate;
}

export async function fingerprintOf(path: string): Promise<Fingerprint | null> {
  try {
    const found = await stat(path);
    const hash = createHash("sha256");

    await pipeline(createReadStream(path), hash);

    return {
      size: found.size,
      modifiedMs: found.mtimeMs,
      inode: found.ino,
      sha256: hash.digest("hex"),
    };
  } catch {
    return null;
  }
}

function sameFile(first: Readonly<Fingerprint>, second: Readonly<Fingerprint> | null): boolean {
  return (
    second !== null &&
    first.size === second.size &&
    first.modifiedMs === second.modifiedMs &&
    first.inode === second.inode &&
    first.sha256 === second.sha256
  );
}

export type Swap =
  | { readonly kind: "changed" }
  | { readonly kind: "placed"; readonly binary: BinaryIdentity | null };

export async function swapped({
  binary,
  candidate,
  target,
  proved,
}: Readonly<{
  binary: string;
  candidate: string;
  target: string;
  proved: Fingerprint;
}>): Promise<Swap> {
  const sameTarget = (await realpath(binary).catch(() => null)) === target;

  if (!sameTarget || !sameFile(proved, await fingerprintOf(candidate))) return { kind: "changed" };

  await rename(candidate, target);

  const placed = await stat(binary).catch(() => null);
  const kept = placed !== null && placed.ino === proved.inode && placed.size === proved.size;

  return {
    kind: "placed",
    binary: kept ? { path: binary, size: placed.size, modifiedMs: placed.mtimeMs } : null,
  };
}
