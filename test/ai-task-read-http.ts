import { CreatedTokenResponseSchema } from "../src/core/contract/access-wire.ts";
import { TaskReadSchema } from "../src/features/bot/core/ai-task-read.ts";
import { type BotLibrary, relatedLibrary, saveBot } from "./bot-task-fixtures.ts";
import { Instance, SECRET_KEY } from "./instance.ts";

export interface ReadWorld {
  readonly instance: Instance;
  readonly library: BotLibrary;
  readonly agentToken: string;
}

export async function readWorld(): Promise<ReadWorld> {
  const instance = await Instance.start({ secretKey: SECRET_KEY });

  await instance.setUp();
  await saveBot(instance);

  const library = await relatedLibrary(instance);

  const { value } = await instance.read("POST", "/api/tokens", CreatedTokenResponseSchema, {
    name: "task-read",
  });

  return { instance, library, agentToken: value };
}

export function readOf(
  instance: Instance,
  id: number | string,
  authorization: string | null,
  cookie = "",
): Promise<Response> {
  const headers = new Headers({ cookie });

  if (authorization !== null) headers.set("authorization", `Bearer ${authorization}`);

  return instance.fetch(`/api/ai-tasks/${String(id)}`, { headers });
}

export async function readTask(instance: Instance, task: Readonly<{ id: number; token: string }>) {
  const response = await readOf(instance, task.id, task.token);
  const text = await response.text();

  return { response, text, read: TaskReadSchema.parse(JSON.parse(text)) };
}
