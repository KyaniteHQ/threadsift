import { type Item, ItemAnswerSchema, PastedAnswerSchema } from "./copy-answers.ts";
import {
  type Copy,
  POLL_MS,
  type Site,
  callCopy,
  decodeAnswer,
  isJson,
  refusal,
  sessionCookie,
} from "./copy-calls.ts";
import { CopyAnswerError } from "./copy-error.ts";
import { callTimeout, pause } from "./timeout.ts";

const SERVE_DEADLINE_MS = 120_000;
const NOT_READY_DEADLINE_MS = 600_000;
const SERVED_IN_A_ROW = 10;
const ITEM_DEADLINE_MS = 300_000;
const MS_PER_SECOND = 1000;

export type { Item };

export interface ServeOptions {
  readonly databaseCreated: boolean;
}

type Answer =
  | { readonly kind: "served" }
  | { readonly kind: "edge" }
  | { readonly kind: "app-error"; readonly status: number; readonly answer: string }
  | { readonly kind: "silent" };

async function answerOf(url: string, deadline: number): Promise<Answer> {
  const response = await fetch(`${url}/api/session`, { signal: callTimeout(deadline) }).catch(
    () => null,
  );

  if (response === null) return { kind: "silent" };

  if (response.status >= 500 && isJson(response)) {
    return { kind: "app-error", status: response.status, answer: await refusal(response) };
  }

  if (response.status === 200 && isJson(response)) return { kind: "served" };

  return response.status === 404 && !isJson(response) ? { kind: "edge" } : { kind: "silent" };
}

function qualifiesForLongWait(answer: Readonly<Answer>, options: Readonly<ServeOptions>): boolean {
  return answer.kind === "edge" || (answer.kind === "app-error" && options.databaseCreated);
}

function failure(url: string, answer: Readonly<Answer> | undefined, waitedMs: number): Error {
  if (answer?.kind === "app-error") {
    return new CopyAnswerError("/api/session", answer.status, answer.answer);
  }

  const seconds = String(Math.round(waitedMs / MS_PER_SECOND));

  return new Error(
    answer?.kind === "edge"
      ? `${url} answered Cloudflare's 404, not the app, for ${seconds} s`
      : `${url} did not serve the app within ${seconds} s`,
  );
}

function worst(earlier: Answer | undefined, answer: Readonly<Answer>): Answer | undefined {
  return answer.kind === "served" || (answer.kind === "silent" && earlier !== undefined)
    ? earlier
    : answer;
}

function announce(answer: Readonly<Answer>, last: Answer["kind"]): void {
  if (answer.kind === last) return;

  if (answer.kind === "edge") {
    process.stdout.write("/api/session got Cloudflare's 404, not the app; waiting\n");
  } else if (answer.kind === "app-error") {
    process.stdout.write(
      "/api/session got the app's 5xx on a database created in this deploy; waiting\n",
    );
  }
}

interface Progress {
  readonly started: number;
  readonly bound: number;
  readonly inARow: number;
  readonly last: Answer["kind"];
  readonly worstAnswer: Answer | undefined;
}

export function awaitServing(url: string, options: Readonly<ServeOptions>): Promise<void> {
  return serveFrom(url, options, {
    started: Date.now(),
    bound: SERVE_DEADLINE_MS,
    inARow: 0,
    last: "served",
    worstAnswer: undefined,
  });
}

async function serveFrom(
  url: string,
  options: Readonly<ServeOptions>,
  progress: Readonly<Progress>,
): Promise<void> {
  const deadline = progress.started + progress.bound;

  if (Date.now() >= deadline) {
    throw failure(url, progress.worstAnswer, Date.now() - progress.started);
  }

  const answer = await answerOf(url, deadline);
  const waited = Date.now() - progress.started;

  if (answer.kind === "app-error" && !options.databaseCreated) throw failure(url, answer, waited);

  const inARow = answer.kind === "served" ? progress.inARow + 1 : 0;

  if (inARow >= SERVED_IN_A_ROW && Date.now() < deadline) {
    process.stdout.write(
      `The copy served the app after ${String(Math.round(waited / MS_PER_SECOND))} s\n`,
    );

    return;
  }

  announce(answer, progress.last);

  const bound = qualifiesForLongWait(answer, options) ? NOT_READY_DEADLINE_MS : progress.bound;

  await pause(POLL_MS, progress.started + bound);

  return serveFrom(url, options, {
    started: progress.started,
    bound,
    inARow,
    last: answer.kind,
    worstAnswer: worst(progress.worstAnswer, answer),
  });
}

export async function expectOk(response: Response, path: string): Promise<void> {
  if (response.status !== 200) {
    throw new CopyAnswerError(path, response.status, await refusal(response));
  }
}

export async function logIn(site: Readonly<Site>, password: string): Promise<Copy> {
  const path = "/api/login";
  const response = await callCopy(site, { path, body: { password } });
  const cookie = sessionCookie(response);

  if (response.status !== 204 || cookie === undefined) {
    throw new CopyAnswerError(path, response.status, await refusal(response));
  }

  return { ...site, cookie };
}

async function postItem(
  copy: Readonly<Copy>,
  body: Readonly<{ url: string; content?: string }>,
  deadline: number,
): Promise<{ id: number; created: boolean }> {
  const response = await callCopy(copy, {
    path: "/api/items",
    cookie: copy.cookie,
    body,
    deadline,
  });

  if (response.status !== 200 && response.status !== 201) {
    throw new CopyAnswerError("/api/items", response.status, await refusal(response));
  }

  const { item } = await decodeAnswer(response, "/api/items", PastedAnswerSchema);

  return { id: item.id, created: response.status === 201 };
}

export function paste(
  copy: Readonly<Copy>,
  link: string,
  deadline = Number.POSITIVE_INFINITY,
): Promise<{ id: number; created: boolean }> {
  process.stdout.write(`Paste ${link}\n`);

  return postItem(copy, { url: link }, deadline);
}

export function pasteThread(
  copy: Readonly<Copy>,
  thread: Readonly<{ url: string; content: string }>,
  deadline: number,
): Promise<{ id: number; created: boolean }> {
  process.stdout.write(`Paste thread ${thread.url}\n`);

  return postItem(copy, thread, deadline);
}

export async function endState(
  copy: Readonly<Copy>,
  id: number,
  deadline = Date.now() + ITEM_DEADLINE_MS,
): Promise<Item> {
  const path = `/api/items/${String(id)}/status`;
  const response = await callCopy(copy, { path, cookie: copy.cookie, deadline });

  await expectOk(response, path);

  const { item } = await decodeAnswer(response, path, ItemAnswerSchema);

  if (item.status !== "processing") return item;

  if (Date.now() >= deadline) {
    throw new Error(`Item ${String(id)} is still processing at its deadline`);
  }

  await pause(POLL_MS, deadline);

  return endState(copy, id, deadline);
}
