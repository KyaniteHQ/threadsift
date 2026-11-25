import { utimesSync } from "node:fs";

import { CreatedTokenResponseSchema } from "../src/core/contract/access-wire.ts";
import { ScriptFolder } from "./bot-script-run.ts";
import { intakeExample } from "./bot-skills-examples.ts";
import { relatedLibrary, retireTasks, saveBot } from "./bot-task-fixtures.ts";
import { taskAfterStart } from "./bot-task-lifecycle.ts";
import { fetcherFile } from "./fetcher-record.ts";
import { Instance, SECRET_KEY } from "./instance.ts";
import { type Listening, listening } from "./loopback-server.ts";
import { type IntakeTask, sentIntake } from "./x-intake-fixtures.ts";

export const MINUTE = 60;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

const CUTOFF_MARGIN = MINUTE / 2;

export const justPast = (period: number) => period + CUTOFF_MARGIN;

export const justBefore = (period: number) => period - CUTOFF_MARGIN;

export const ageBy = (file: string, seconds: number) => {
  const then = Date.now() / 1000 - seconds;

  utimesSync(file, then, then);
};

interface Servers {
  readonly real: Listening;
  readonly failing: Listening;
}

interface Library {
  readonly agentToken: string;
  readonly candidate: number;
  readonly source: number;
}

async function shutDown(): Promise<Listening> {
  const down = await Instance.start({ secretKey: SECRET_KEY });
  const server = await listening((request) => down.fetch(request));

  await down.close();

  return server;
}

export class ScriptWorld {
  readonly folder = new ScriptFolder();
  readonly instance: Instance;
  readonly agentToken: string;
  readonly candidate: number;
  private readonly source: number;
  private readonly servers: Servers;

  private constructor(instance: Instance, library: Library, servers: Servers) {
    this.instance = instance;
    this.agentToken = library.agentToken;
    this.candidate = library.candidate;
    this.source = library.source;
    this.servers = servers;
  }

  static async start(): Promise<ScriptWorld> {
    const instance = await Instance.start({
      secretKey: SECRET_KEY,
      fetchers: fetcherFile("first.mts"),
    });

    await instance.setUp();
    await saveBot(instance);

    const library = await relatedLibrary(instance);

    const { value } = await instance.read("POST", "/api/tokens", CreatedTokenResponseSchema, {
      name: "bot-script",
    });

    return new ScriptWorld(
      instance,
      { agentToken: value, candidate: library.candidates[0], source: library.source },
      { real: await listening((request) => instance.fetch(request)), failing: await shutDown() },
    );
  }

  get address(): string {
    return this.servers.real.url;
  }

  get failingAddress(): string {
    return this.servers.failing.url;
  }

  env(url = this.address, token = this.agentToken) {
    return { THREADSIFT_URL: url, THREADSIFT_AGENT_TOKEN: token };
  }

  reset(): void {
    retireTasks(this.instance);
  }

  async tokenWith(name: string, scopes: readonly string[]): Promise<string> {
    const { value } = await this.instance.read("POST", "/api/tokens", CreatedTokenResponseSchema, {
      name,
      scopes,
    });

    return value;
  }

  async intake(): Promise<IntakeTask & { readonly example: string }> {
    const task = await sentIntake(this.instance);

    return { ...task, example: intakeExample(task.statusId) };
  }

  result(): Promise<{ readonly id: number; readonly token: string }> {
    return taskAfterStart(this.instance, this.source);
  }

  eventOf(task: Readonly<{ id: number; token: string }>, kind: string): string {
    return JSON.stringify({ taskId: task.id, kind, callbackToken: task.token });
  }

  async opened(
    task: Readonly<{ id: number; token: string }>,
    kind: string,
    env = this.env(),
  ): Promise<string> {
    const event = this.folder.event(this.eventOf(task, kind));

    return (await this.folder.run(["task-open", event], env)).word;
  }

  async close(): Promise<void> {
    await Promise.all([this.servers.real.stop(), this.servers.failing.stop()]);
    this.folder.remove();
    await this.instance.close();
  }
}
