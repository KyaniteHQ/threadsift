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
} from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative } from "node:path";
import { pipeline } from "node:stream/promises";

import { z } from "zod";

import { RefusedUpdateSchema } from "../../core/contract/x-settings-contract.ts";
import { bestEffort, errnoCodeOf, report, withCleanup } from "../../core/kernel/failure-log.ts";
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

async function orGone<Value>(step: () => Promise<Value>): Promise<Value | null> {
  try {
    return await step();
  } catch (cause) {
    if (errnoCodeOf(cause) !== "ENOENT") throw cause;

    return null;
  }
}

async function sweptOlder(
  folder: string,
  prefix: string,
  now: number,
  clock: "ctimeMs" | "mtimeMs",
): Promise<void> {
  const names = (await readdir(folder)).filter((name) => name.startsWith(prefix));

  await Promise.all(
    names.map(async (name) => {
      const path = join(folder, name);
      const found = await orGone(() => stat(path));

      if (found !== null && now - found[clock] >= STALE_MS) {
        await rm(path, { recursive: true, force: true });
      }
    }),
  );
}

interface LockIdentity {
  readonly ino: bigint;
  readonly mtimeNs: bigint;
}

function sameLock(found: Readonly<LockIdentity> | null, stale: Readonly<LockIdentity>): boolean {
  return found !== null && found.ino === stale.ino && found.mtimeNs === stale.mtimeNs;
}

const NO_HARD_LINKS = new Set(["EPERM", "EOPNOTSUPP", "EXDEV", "ENOSYS"]);

async function linked(existing: string, name: string): Promise<"linked" | "taken" | "unsupported"> {
  try {
    await link(existing, name);

    return "linked";
  } catch (cause) {
    const code = errnoCodeOf(cause);

    if (code === "EEXIST" || code === "ENOENT") return "taken";

    if (NO_HARD_LINKS.has(code)) return "unsupported";

    throw cause;
  }
}

async function withoutLeftover<Result>(path: string, body: () => Promise<Result>): Promise<Result> {
  try {
    return await body();
  } finally {
    await bestEffort({ event: "grok-update-link-not-removed", fields: {} }, () =>
      rm(path, { force: true }),
    );
  }
}

async function brokenByLink(
  lock: string,
  stale: Readonly<LockIdentity>,
): Promise<boolean | "unsupported"> {
  const tomb = `${lock}.${String(stale.ino)}-${String(stale.mtimeNs)}`;
  const outcome = await linked(lock, tomb);

  if (outcome !== "linked") return outcome === "unsupported" ? outcome : false;

  return withoutLeftover(tomb, async () => {
    if (!sameLock(await orGone(() => stat(tomb, { bigint: true })), stale)) return false;

    await rm(lock, { force: true });

    return created(lock);
  });
}

const renamingLocks = new Set<string>();

async function brokenByRename(lock: string, stale: Readonly<LockIdentity>): Promise<boolean> {
  if (!renamingLocks.has(lock)) {
    renamingLocks.add(lock);
    report("grok-update-lock-without-hard-links", {});
  }

  const aside = `${lock}.${randomUUID()}`;

  if ((await orGone(() => rename(lock, aside))) === null) return false;

  return withoutLeftover(aside, async () => {
    const found = await orGone(() => stat(aside, { bigint: true }));

    if (found === null) return false;

    if (sameLock(found, stale)) return created(lock);

    await rename(aside, lock);

    return false;
  });
}

export async function claimed(lock: string, now: number): Promise<boolean> {
  await sweptOlder(dirname(lock), `${basename(lock)}.`, now, "ctimeMs");

  if (await created(lock)) return true;

  const held = await orGone(() => stat(lock, { bigint: true }));

  if (held === null) return created(lock);

  if (now - Number(held.mtimeMs) < STALE_MS) return false;

  const stale = { ino: held.ino, mtimeNs: held.mtimeNs };
  const broken = await brokenByLink(lock, stale);

  return broken === "unsupported" ? brokenByRename(lock, stale) : broken;
}

export function sweptStaging(folder: string, now: number): Promise<void> {
  return sweptOlder(folder, STAGING_PREFIX, now, "mtimeMs");
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
