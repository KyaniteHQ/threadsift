import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import {
  type ModelList,
  type ModelListRequest,
  ModelListRequestSchema,
} from "../../src/core/contract/ai-settings-contract.ts";
import { PROVIDERS, type Provider } from "../../src/core/contract/provider-families.ts";
import { listAiModels } from "./ai-api.ts";

export type ModelAnswer = ModelList | { readonly kind: "failed" };

interface Entry {
  readonly provider: Provider;
  readonly asked: number;
  readonly loading: boolean;
  readonly answer: ModelAnswer | undefined;
}

type Entries = ReadonlyMap<string, Entry>;

type Event =
  | {
      readonly type: "asked";
      readonly id: string;
      readonly provider: Provider;
      readonly asked: number;
    }
  | {
      readonly type: "answered";
      readonly id: string;
      readonly asked: number;
      readonly answer: ModelAnswer;
    };

function entriesAfter(entries: Readonly<Entries>, event: Readonly<Event>): Entries {
  const current = entries.get(event.id);

  if (event.type === "asked")
    return new Map(entries).set(event.id, {
      provider: event.provider,
      asked: event.asked,
      loading: true,
      answer: current?.answer,
    });

  if (current?.asked !== event.asked) return entries;

  return new Map(entries).set(event.id, { ...current, loading: false, answer: event.answer });
}

function hasBaseUrl(provider: Provider): boolean {
  return "baseUrl" in PROVIDERS[provider].fields;
}

function listId(provider: Provider, baseUrl: string): string {
  return hasBaseUrl(provider) ? `${provider} ${baseUrl}` : provider;
}

function requestOf(provider: Provider, baseUrl: string, key: string): ModelListRequest | null {
  if (!("model" in PROVIDERS[provider].fields)) return null;

  const target = hasBaseUrl(provider) ? { provider, baseUrl } : { provider };
  const parsed = ModelListRequestSchema.safeParse(key === "" ? target : { ...target, key });

  return parsed.success ? parsed.data : null;
}

function shownOf(entries: Readonly<Entries>, id: string, provider: Provider) {
  const own = entries.get(id);

  if (own === undefined) return { loading: false, answer: undefined };

  if (own.answer !== undefined || !own.loading) return own;

  const latest = [...entries.values()]
    .filter((entry) => entry.provider === provider && entry.answer !== undefined)
    .toSorted((a, b) => b.asked - a.asked)[0];

  return { loading: true, answer: latest?.answer };
}

async function answerOf(request: Readonly<ModelListRequest>): Promise<ModelAnswer> {
  try {
    return await listAiModels(request);
  } catch {
    return { kind: "failed" };
  }
}

function useAsk(dispatch: (event: Readonly<Event>) => void) {
  const asks = useRef(0);
  const asked = useRef(new Set<string>());

  const ask = useCallback(
    (target: string, request: Readonly<ModelListRequest>) => {
      asks.current += 1;
      const mine = asks.current;

      asked.current.add(target);
      dispatch({ type: "asked", id: target, provider: request.provider, asked: mine });

      const settle = async () => {
        dispatch({ type: "answered", id: target, asked: mine, answer: await answerOf(request) });
      };

      void settle();
    },
    [dispatch],
  );

  const askOnce = useCallback(
    (target: string, request: Readonly<ModelListRequest>) => {
      if (!asked.current.has(target)) ask(target, request);
    },
    [ask],
  );

  return { ask, askOnce };
}

export function useModelList(provider: Provider, savedBaseUrl: string, key: string) {
  const [entries, dispatch] = useReducer(entriesAfter, new Map<string, Entry>());
  const [baseUrl, setBaseUrl] = useState(savedBaseUrl);
  const { ask, askOnce } = useAsk(dispatch);
  const keyAsked = useRef({ id: "", key: "" });
  const id = listId(provider, baseUrl);

  useEffect(() => {
    const request = requestOf(provider, baseUrl, key);

    if (request !== null) askOnce(id, request);
  }, [provider, baseUrl, key, id, askOnce]);

  const baseUrlLeft = useCallback(
    (value: string) => {
      const left = value.trim();
      const request = requestOf(provider, left, key);

      setBaseUrl(left);
      if (request !== null) askOnce(listId(provider, left), request);
    },
    [provider, key, askOnce],
  );

  const keyLeft = useCallback(
    (value: string) => {
      if (keyAsked.current.id === id && keyAsked.current.key === value) return;

      keyAsked.current = { id, key: value };

      const request = requestOf(provider, baseUrl, value);

      if (request !== null) ask(id, request);
    },
    [id, provider, baseUrl, ask],
  );

  const { loading, answer } = shownOf(entries, id, provider);

  return { loading, answer, baseUrlLeft, keyLeft } as const;
}

export type ModelListState = ReturnType<typeof useModelList>;
