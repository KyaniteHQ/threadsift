import { useEffect, useMemo, useReducer, useRef, useState } from "react";

import {
  type ModelList,
  type ModelListRequest,
  ModelListRequestSchema,
} from "../../src/core/contract/ai-settings-contract.ts";
import { PROVIDERS, type Provider } from "../../src/core/contract/provider-families.ts";
import { listAiModels } from "./ai-api.ts";

export type ModelAnswer = ModelList | { readonly kind: "failed" };

type Entry =
  | { readonly kind: "loading" }
  | { readonly kind: "answered"; readonly answer: ModelAnswer };

type Entries = ReadonlyMap<string, Entry>;

type Event =
  | { readonly type: "asked"; readonly id: string }
  | { readonly type: "answered"; readonly id: string; readonly answer: ModelAnswer };

interface TypedKey {
  readonly key: string;
  readonly list: string;
}

function entriesAfter(entries: Readonly<Entries>, event: Readonly<Event>): Entries {
  return new Map(entries).set(
    event.id,
    event.type === "asked" ? { kind: "loading" } : { kind: "answered", answer: event.answer },
  );
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

function answerId(request: Readonly<ModelListRequest>, revision: number): string {
  return JSON.stringify([revision, request.provider, request.baseUrl ?? null, request.key ?? null]);
}

async function answerOf(request: Readonly<ModelListRequest>): Promise<ModelAnswer> {
  try {
    return await listAiModels(request);
  } catch {
    return { kind: "failed" };
  }
}

function sentKey(typed: Readonly<TypedKey> | null, list: string, key: string): string {
  return typed !== null && typed.list === list && typed.key === key ? key : "";
}

function useAnswers(request: Readonly<ModelListRequest> | null, revision: number) {
  const [entries, dispatch] = useReducer(entriesAfter, new Map<string, Entry>());
  const asked = useRef(new Set<string>());
  const id = request === null ? null : answerId(request, revision);

  useEffect(() => {
    if (request === null || id === null || asked.current.has(id)) return;

    asked.current.add(id);
    dispatch({ type: "asked", id });

    const settle = async () => {
      dispatch({ type: "answered", id, answer: await answerOf(request) });
    };

    void settle();
  }, [request, id]);

  const entry = id === null ? undefined : entries.get(id);

  return {
    loading: id !== null && entry?.kind !== "answered",
    answer: entry?.kind === "answered" ? entry.answer : undefined,
  } as const;
}

export function useModelList(
  provider: Provider,
  initialBaseUrl: string,
  key: string,
  revision: number,
) {
  const [baseUrl, setBaseUrl] = useState(initialBaseUrl);
  const [typed, setTyped] = useState<TypedKey | null>(null);
  const list = listId(provider, baseUrl);
  const sent = sentKey(typed, list, key);
  const request = useMemo(() => requestOf(provider, baseUrl, sent), [provider, baseUrl, sent]);
  const { loading, answer } = useAnswers(request, revision);

  const baseUrlLeft = (value: string) => {
    setBaseUrl(value.trim());
  };

  const keyLeft = (value: string) => {
    setTyped((last) => {
      if (value === (last?.key ?? "")) return last;

      return value === "" ? null : { key: value, list };
    });
  };

  return { loading, answer, baseUrlLeft, keyLeft } as const;
}

export type ModelListState = ReturnType<typeof useModelList>;
