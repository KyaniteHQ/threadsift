import { rejectsKeyWith400 } from "../../../core/contract/ai-contract.ts";
import {
  MODEL_LIST_PAGES,
  type ModelList,
  type ModelListRequest,
  type ModelOption,
  type ModelUnlistedReason,
} from "../../../core/contract/ai-settings-contract.ts";
import { AiAddressRefused } from "../../../core/contract/ai-url.ts";
import {
  AI_MODEL_MAX,
  type HttpProvider,
  PROVIDERS,
  hasKind,
  withoutTrailingSlashes,
} from "../../../core/contract/provider-families.ts";
import { HOP_DEADLINE_MS } from "../../../core/contract/request-waits.ts";
import { readCapped } from "../../../core/kernel/capped.ts";
import type { SettingsPorts } from "../../../core/kernel/ports.ts";
import { loadSavedKey } from "./ai-load.ts";
import { allowsUrl, providersOf, runnerFor } from "./ai-run.ts";
import { aiTransport } from "./ai-transport.ts";
import { LISTINGS, type Page } from "./provider-model-pages.ts";

const MODEL_LIST_BYTES = 4 * 1024 * 1024;

const WORKERS_AI_MODELS = [
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "@cf/meta/llama-3-8b-instruct",
  "@cf/meta/llama-3.1-8b-instruct",
  "@hf/nousresearch/hermes-2-pro-mistral-7b",
  "@hf/thebloke/deepseek-coder-6.7b-instruct-awq",
  "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
].map((id) => ({ id }));

type Unlisted = Extract<ModelList, { readonly kind: "unlisted" }>;

export type ModelListAnswer = ModelList | { readonly kind: "not-offered" };

const NOT_OFFERED = { kind: "not-offered" } as const;

function unlisted(reason: ModelUnlistedReason): Unlisted {
  return { kind: "unlisted", reason };
}

function statusReason(
  provider: HttpProvider,
  status: number,
  text: string,
  keySent: boolean,
): ModelUnlistedReason {
  if (status === 401 || status === 403) return keySent ? "wrong-key" : "key-needed";

  if (rejectsKeyWith400(provider, status, text)) return "wrong-key";

  return status === 429 || status >= 500 ? "unreachable" : "no-list";
}

interface Fetch {
  readonly request: typeof fetch;
  readonly provider: HttpProvider;
  readonly base: string;
  readonly key: string | undefined;
  readonly signal: AbortSignal;
}

async function fetchPage(
  { request, provider, base, key, signal }: Readonly<Fetch>,
  after: string | null,
): Promise<Page | Unlisted> {
  const listing = LISTINGS[provider];

  try {
    const response = await aiTransport(request)(listing.address(base, after), {
      headers: key === undefined ? {} : listing.headers(key),
      signal: AbortSignal.any([signal, AbortSignal.timeout(HOP_DEADLINE_MS)]),
    });
    const { bytes, cut } =
      response.body === null
        ? { bytes: new Uint8Array(), cut: false }
        : await readCapped(response.body, MODEL_LIST_BYTES);
    const text = new TextDecoder().decode(bytes);

    if (response.status !== 200)
      return unlisted(statusReason(provider, response.status, text, key !== undefined));

    return (cut ? null : listing.read(text)) ?? unlisted("no-list");
  } catch (error) {
    return unlisted(error instanceof AiAddressRefused ? "refused" : "unreachable");
  }
}

async function collected(
  fetching: Readonly<Fetch>,
  after: string | null,
  pagesLeft: number,
): Promise<readonly ModelOption[] | Unlisted> {
  const page = await fetchPage(fetching, after);

  if ("kind" in page) return page;

  if (page.after === null || pagesLeft <= 1) return page.models;

  const rest = await collected(fetching, page.after, pagesLeft - 1);

  return "kind" in rest ? rest : [...page.models, ...rest];
}

const BY_LABEL = new Intl.Collator("en", { sensitivity: "base", numeric: true });

function listedFromProvider(models: readonly ModelOption[]): ModelList {
  const unique = [...new Map(models.map((model) => [model.id, model])).values()].filter(
    ({ id }) => id.trim() !== "" && id.length <= AI_MODEL_MAX,
  );

  if (unique.length === 0) return unlisted("no-list");

  return {
    kind: "listed",
    source: "provider",
    models: unique.toSorted((a, b) => BY_LABEL.compare(a.label ?? a.id, b.label ?? b.id)),
  };
}

async function listedOverHttp(
  ports: SettingsPorts,
  input: Readonly<ModelListRequest> & { readonly provider: HttpProvider },
  signal: AbortSignal,
): Promise<ModelList> {
  const { provider } = input;
  const target = input.baseUrl ?? PROVIDERS[provider].url;

  if (target === null) return unlisted("no-list");

  const base = withoutTrailingSlashes(target);

  if (!allowsUrl(ports.ai, base)) return unlisted("refused");

  const key = input.key ?? (await loadSavedKey(ports, { provider, baseUrl: base }));

  if (key === undefined && !LISTINGS[provider].listsWithoutKey) return unlisted("key-needed");

  const models = await collected(
    { request: ports.ai.request, provider, base, key, signal },
    null,
    MODEL_LIST_PAGES,
  );

  return "kind" in models ? models : listedFromProvider(models);
}

function listedLocally(ports: SettingsPorts, input: Readonly<ModelListRequest>): ModelListAnswer {
  if (hasKind("binding", input))
    return { kind: "listed", source: "fixed", models: WORKERS_AI_MODELS };

  if (!hasKind("cli", input)) return NOT_OFFERED;

  const runner = runnerFor(ports.ai, input.provider);

  return runner === undefined
    ? NOT_OFFERED
    : { kind: "listed", source: "cli", models: runner.models };
}

export function listModels(
  ports: SettingsPorts,
  input: Readonly<ModelListRequest>,
  signal: AbortSignal,
): Promise<ModelListAnswer> {
  if (!providersOf(ports.ai).includes(input.provider)) return Promise.resolve(NOT_OFFERED);

  return hasKind("http", input)
    ? listedOverHttp(ports, input, signal)
    : Promise.resolve(listedLocally(ports, input));
}
