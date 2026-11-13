export const REDDIT_CONNECT_STATES = [
  "unavailable",
  "none",
  "connected",
  "expired",
  "unreadable",
  "missing",
  "no-access",
  "signed-out",
  "scope-refused",
  "token-refused",
  "unreachable",
  "failed",
  "access-kept",
] as const;

export type RedditConnectState = (typeof REDDIT_CONNECT_STATES)[number];

export const RELAY_PORT = "relay";

export const RELAY_PRESENCE_MS = 3000;

export const RELAY_RESULT_MS = 35_000;

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

export interface Posted {
  readonly source: unknown;
  readonly origin: string;
  readonly data: Candidate;
}

export interface Candidate {
  readonly threadsift?: string;
  readonly id?: string;
  readonly state?: string;
  readonly working?: boolean;
}

export type RelayReply =
  | { readonly kind: "working" }
  | { readonly kind: "state"; readonly state: RedditConnectState };

function exactly(data: Readonly<Candidate>, names: readonly (keyof Candidate)[]) {
  const copy: Candidate = { ...data };
  const own = Object.keys(copy);

  return own.length === names.length && names.every((name) => own.includes(name)) ? copy : null;
}

function stateOf(state: string | undefined): RedditConnectState | null {
  return REDDIT_CONNECT_STATES.find((each) => each === state) ?? null;
}

export function relayRequest(id: string) {
  return { threadsift: "reconnect-reddit", id } as const;
}

export function relayWorking(id: string) {
  return { threadsift: "reddit-working", id } as const;
}

export function relayAnswer(id: string, state: RedditConnectState) {
  return { threadsift: "reddit-state", id, state } as const;
}

export function requestIdOf(data: Readonly<Candidate>): string | null {
  const asked = exactly(data, ["threadsift", "id"]);

  return asked?.threadsift === "reconnect-reddit" && ID_PATTERN.test(String(asked.id))
    ? String(asked.id)
    : null;
}

export function replyTo(data: Readonly<Candidate>, id: string): RelayReply | null {
  const working = exactly(data, ["threadsift", "id"]);

  if (working?.threadsift === "reddit-working" && working.id === id) return { kind: "working" };

  const answer = exactly(data, ["threadsift", "id", "state"]);
  const state = stateOf(answer?.state);

  return answer?.threadsift === "reddit-state" && answer.id === id && state !== null
    ? { kind: "state", state }
    : null;
}

export function workerAnswerState(data: Readonly<Candidate>): RedditConnectState | null {
  return stateOf(exactly(data, ["state"])?.state);
}

export const WORKER_WORKING = { working: true } as const;

export function workerIsWorking(data: Readonly<Candidate>): boolean {
  return exactly(data, ["working"])?.working === true;
}
