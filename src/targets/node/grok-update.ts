import {
  access,
  constants,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";

import { z } from "zod";

import {
  type RefusedUpdate,
  RefusedUpdateSchema,
} from "../../core/contract/x-settings-contract.ts";
import { errnoCodeOf, errorClassOf, report, withCleanup } from "../../core/kernel/failure-log.ts";
import { parsedJson } from "../../core/kernel/parsed-json.ts";
import type { ProcessEnd } from "./cli-process.ts";
import { type BinaryIdentity, identityOf, inRunFolders } from "./grok-folders.ts";
import { type GrokUpdateCommands, grokCli, grokUpdateCommands } from "./grok-process.ts";
import { type Trial, trialOf, within } from "./grok-trial.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const CHECK_MS = 60_000;
const DOWNLOAD_MS = 10 * 60_000;
const TICK_MS = 60 * 60 * 1000;
const STAGING_FOLDER = ".threadsift-update";
const STATE_FILE = "grok-update.json";

const StateSchema = z.object({
  checkedAt: z.number(),
  refused: RefusedUpdateSchema.nullable(),
});

type UpdateState = z.output<typeof StateSchema>;

const CheckSchema = z.object({ latestVersion: z.string().min(1), updateAvailable: z.boolean() });

type Outcome =
  | "current"
  | "not-writable"
  | "check-failed"
  | "already-refused"
  | "download-failed"
  | "inconclusive"
  | "refused"
  | "installed";

export interface UpdateHost {
  readonly idle: () => boolean;
  readonly installed: (binary: Readonly<BinaryIdentity> | null) => void;
}

export interface UpdateSource {
  readonly binary: string;
  readonly authFile: string;
  readonly dataDir: string;
}

export interface Updates {
  readonly refusedUpdate: () => RefusedUpdate | null;
  readonly stop: () => void;
}

interface UpdatePlan {
  readonly binary: string;
  readonly stateFile: string;
  readonly commands: GrokUpdateCommands;
  readonly prove: (candidate: string, signal: AbortSignal) => Promise<Trial>;
  readonly host: UpdateHost;
}

function succeeded(end: Readonly<ProcessEnd>): end is Extract<ProcessEnd, { kind: "exited" }> {
  return end.kind === "exited" && end.code === 0;
}

async function readState(file: string): Promise<UpdateState | null> {
  return parsedJson(StateSchema, await readFile(file, "utf8").catch(() => ""));
}

async function writeState(file: string, state: Readonly<UpdateState>): Promise<void> {
  const temporary = `${file}.${String(process.pid)}.tmp`;

  await writeFile(temporary, JSON.stringify(state));
  await rename(temporary, file);
}

function writable(folder: string): Promise<boolean> {
  return access(folder, constants.W_OK).then(
    () => true,
    () => false,
  );
}

async function candidateIn(staging: string): Promise<string | null> {
  const candidate = await realpath(join(staging, "bin", "grok")).catch(() => null);

  if (candidate === null) return null;

  const inside = relative(staging, candidate);

  return inside.startsWith("..") || isAbsolute(inside) ? null : candidate;
}

function sameContent(proved: Readonly<BinaryIdentity> | null, installed: BinaryIdentity | null) {
  return (
    proved !== null &&
    installed !== null &&
    proved.size === installed.size &&
    proved.modifiedMs === installed.modifiedMs
  );
}

class GrokUpdates implements Updates {
  private readonly plan: UpdatePlan;
  private readonly shutdown = new AbortController();
  private readonly timers: NodeJS.Timeout[] = [];
  private refused: RefusedUpdate | null = null;
  private updating = false;

  constructor(plan: Readonly<UpdatePlan>) {
    this.plan = plan;
  }

  readonly refusedUpdate = (): RefusedUpdate | null => this.refused;

  readonly stop = (): void => {
    for (const timer of this.timers) clearTimeout(timer);

    this.shutdown.abort();
  };

  async load(): Promise<void> {
    this.refused = (await readState(this.plan.stateFile))?.refused ?? null;
  }

  start(): void {
    const tick = (): void => {
      void this.tick();
    };

    this.timers.push(setTimeout(tick, 0), setInterval(tick, TICK_MS));
  }

  private async tick(): Promise<void> {
    if (this.updating || !this.plan.host.idle()) return;

    this.updating = true;

    try {
      await this.runIfDue(Date.now(), this.shutdown.signal);
    } catch (cause) {
      report("grok-update-error", { error: errorClassOf(cause), code: errnoCodeOf(cause) });
    } finally {
      this.updating = false;
    }
  }

  private async runIfDue(now: number, signal: AbortSignal): Promise<void> {
    const state = await readState(this.plan.stateFile);

    this.refused = state?.refused ?? null;

    if (state !== null && now - state.checkedAt < DAY_MS) return;

    await this.save(now);

    const { outcome, version } = await this.attempt(now, signal);

    report("grok-update", { outcome, version });
  }

  private async save(checkedAt: number): Promise<void> {
    await writeState(this.plan.stateFile, { checkedAt, refused: this.refused });
  }

  private async attempt(
    now: number,
    signal: AbortSignal,
  ): Promise<{ outcome: Outcome; version: string }> {
    const target = await realpath(this.plan.binary);
    const folder = dirname(target);

    if (!(await writable(folder))) return { outcome: "not-writable", version: "none" };

    const end = await inRunFolders((folders) =>
      this.plan.commands.check(folders, within(signal, CHECK_MS)),
    );

    const answer = succeeded(end) ? parsedJson(CheckSchema, end.stdout) : null;

    if (answer === null) return { outcome: "check-failed", version: "none" };

    const version = answer.latestVersion;

    if (!answer.updateAvailable) {
      this.refused = null;
      await this.save(now);

      return { outcome: "current", version };
    }

    if (this.refused?.version === version) return { outcome: "already-refused", version };

    const staging = join(folder, STAGING_FOLDER);

    const removed = () => rm(staging, { recursive: true, force: true });

    await removed();
    await mkdir(staging);

    const outcome = await withCleanup(
      { event: "grok-update-staging-not-removed", fields: {} },
      () => this.tried(staging, target, version, now, signal),
      removed,
    );

    return { outcome, version };
  }

  private async tried(
    staging: string,
    target: string,
    version: string,
    now: number,
    signal: AbortSignal,
  ): Promise<Outcome> {
    const end = await inRunFolders((folders) =>
      this.plan.commands.update(folders, version, staging, within(signal, DOWNLOAD_MS)),
    );

    const candidate = succeeded(end) ? await candidateIn(staging) : null;

    if (candidate === null) return "download-failed";

    const { result } = await this.plan.prove(candidate, signal);

    if (result.kind === "inconclusive") return "inconclusive";

    if (result.verdict !== "proven") {
      this.refused = { version, reason: result.verdict };
      await this.save(now);

      return "refused";
    }

    const proved = await identityOf(candidate);

    await rename(candidate, target);

    const installed = await identityOf(this.plan.binary);

    this.plan.host.installed(sameContent(proved, installed) ? installed : null);
    this.refused = null;
    await this.save(now);

    return "installed";
  }
}

export async function grokUpdates(
  { binary, authFile, dataDir }: Readonly<UpdateSource>,
  host: Readonly<UpdateHost>,
): Promise<Updates> {
  const updates = new GrokUpdates({
    binary,
    stateFile: join(dataDir, STATE_FILE),
    commands: grokUpdateCommands(binary),
    prove: (candidate, signal) => trialOf(grokCli(candidate, authFile), signal),
    host,
  });

  await updates.load();
  updates.start();

  return updates;
}
