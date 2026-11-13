import { CreatedTokenResponseSchema } from "../src/http/schemas.ts";
import { ScriptFolder } from "./bot-script-run.ts";
import { type Listening, listening } from "./bot-script-server.ts";
import { intakeExample } from "./bot-skills-examples.ts";
import { SECRET_KEY, relatedLibrary, retireTasks, saveBot } from "./bot-task-fixtures.ts";
import { taskAfterStart } from "./bot-task-lifecycle.ts";
import { Instance } from "./instance.ts";
import { type IntakeTask, sentIntakeForContent } from "./x-intake-fixtures.ts";

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
    const instance = await Instance.start({ secretKey: SECRET_KEY });

    await instance.setUp();
    await saveBot(instance);

    const library = await relatedLibrary(instance);

    const { value } = await instance.read("POST", "/api/tokens", CreatedTokenResponseSchema, {
      name: "bot-script",
    });

    return new ScriptWorld(
      instance,
      { agentToken: value, candidate: library.candidates[0] ?? 0, source: library.source },
      { real: await listening((request) => instance.fetch(request)), failing: await shutDown() },
    );
  }

  get address(): string {
    return this.servers.real.url;
  }

  get failingAddress(): string {
    return this.servers.failing.url;
  }

  answeringEmptyBatch(): Promise<Listening> {
    return listening(() => Promise.resolve(Response.json({ results: [] })));
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
    const task = await sentIntakeForContent(this.instance);

    return { ...task, example: intakeExample(task.statusId) };
  }

  result(): Promise<{ readonly id: number; readonly token: string }> {
    return taskAfterStart(this.instance, this.source);
  }

  async opened(
    task: Readonly<{ id: number; token: string }>,
    kind: string,
    env = this.env(),
  ): Promise<string> {
    const event = this.folder.event(
      JSON.stringify({ taskId: task.id, kind, callbackToken: task.token }),
    );

    return (await this.folder.run(["task-open", event], env)).word;
  }

  async close(): Promise<void> {
    this.servers.real.stop();
    this.servers.failing.stop();
    this.folder.remove();
    await this.instance.close();
  }
}
