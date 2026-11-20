import { answerWithin } from "./cli-process.ts";
import { inRunFolders } from "./grok-folders.ts";
import type { GrokCli } from "./grok-process.ts";
import type { SignInLine } from "./grok-sign-in.ts";

const STATUS_CACHE_MS = 10_000;

interface Reading {
  readonly version: string | null;
  readonly signedIn: SignInLine;
}

async function readSignIn(cli: GrokCli, limit: AbortSignal): Promise<SignInLine> {
  const probe = () => inRunFolders((folders) => cli.signIn(folders, limit));
  const first = await probe();

  if (first !== "signed-out") return first;

  limit.throwIfAborted();

  return probe();
}

async function readOnce(cli: GrokCli, stop: AbortSignal): Promise<Reading> {
  const [version, signedIn] = await Promise.all([
    answerWithin(
      stop,
      async (limit) => (await inRunFolders((folders) => cli.version(folders, limit))).version,
      null,
    ),
    answerWithin(stop, (limit) => readSignIn(cli, limit), "unknown" as const),
  ]);

  return { version, signedIn };
}

export function sharedReading(cli: GrokCli, stop: AbortSignal): () => Promise<Reading> {
  let reading: Promise<Reading> | null = null;
  let expiresAt: number | null = null;

  return () => {
    if (reading !== null && (expiresAt === null || Date.now() < expiresAt)) return reading;

    expiresAt = null;

    const started = readOnce(cli, stop).then((read) => {
      if (reading === started) {
        expiresAt =
          read.version !== null && read.signedIn !== "unknown" ? Date.now() + STATUS_CACHE_MS : 0;
      }

      return read;
    });

    reading = started;

    return started;
  };
}
