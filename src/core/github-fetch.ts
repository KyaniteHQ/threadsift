import { z } from "zod";

import type { Fetched } from "./details.ts";
import { fromBase64 } from "./encoding.ts";
import {
  type FetchPolicy,
  type GuardOutcome,
  type Page,
  NO_HEADERS,
  SMALL_BODY_BYTES,
  guardedFetch,
} from "./fetch-guard.ts";
import type { FetchFailure } from "./fetch-results.ts";
import { isRedditOrXLink } from "./links.ts";
import type { Network, RequestHeaders } from "./ports.ts";
import type { RepositoryRef } from "./repository-ref.ts";

const API_ORIGIN = "https://api.github.com";
const API_HOST = "api.github.com";
const NOT_FOUND = 404;
const MARKDOWN_NAME = /\.(?:md|markdown)$/iu;
const NO_LICENSE = "NOASSERTION";
const README_ANSWER_BYTES = 768 * 1024;

const API_HEADERS: RequestHeaders = {
  accept: "application/vnd.github+json",
  "x-github-api-version": "2022-11-28",
};

function headersFor(url: string): RequestHeaders {
  const { protocol, hostname } = new URL(url);

  return protocol === "https:" && hostname === API_HOST ? API_HEADERS : NO_HEADERS;
}

const API_POLICY: FetchPolicy = {
  stopAt: isRedditOrXLink,
  followMetaRefresh: () => false,
  readsBody: () => true,
  headers: headersFor,
  htmlMaxBytes: SMALL_BODY_BYTES,
  dataMaxBytes: SMALL_BODY_BYTES,
};

const README_POLICY: FetchPolicy = { ...API_POLICY, dataMaxBytes: README_ANSWER_BYTES };

const RepositoryAnswerSchema = z
  .object({
    name: z.string().min(1),
    owner: z.object({ login: z.string().min(1) }),
    full_name: z.string().min(1),
    description: z.string().nullable(),
    stargazers_count: z.number().int().nonnegative(),
    language: z.string().nullable(),
    license: z.object({ spdx_id: z.string().nullable() }).nullable(),
    topics: z.array(z.string()).default([]),
    pushed_at: z.iso.datetime().nullable(),
  })
  .transform((answer) => {
    const spdx = answer.license?.spdx_id ?? null;

    return {
      owner: answer.owner.login,
      name: answer.name,
      title: answer.full_name,
      repository: {
        description: answer.description,
        stars: answer.stargazers_count,
        language: answer.language,
        license: spdx === NO_LICENSE ? null : spdx,
        topics: answer.topics,
        pushedAt: answer.pushed_at === null ? null : Date.parse(answer.pushed_at),
      },
    };
  });

const ReadmeAnswerSchema = z.object({
  name: z.string(),
  encoding: z.string(),
  content: z.string(),
});

type Readme =
  | { readonly kind: "text"; readonly text: string | null }
  | { readonly kind: "failed"; readonly status: FetchFailure };

const WITHOUT_README: Readme = { kind: "text", text: null };

const UNREADABLE_README: Readme = { kind: "failed", status: "unreadable" };

function failureOf(outcome: Exclude<GuardOutcome, Page>): FetchFailure {
  return outcome.kind === "stopped" ? "redirect-stopped" : outcome.reason;
}

function getApi(
  network: Network,
  path: string,
  policy: Readonly<FetchPolicy>,
  deadline: AbortSignal,
): Promise<GuardOutcome> {
  return guardedFetch(network, `${API_ORIGIN}${path}`, policy, deadline);
}

function parsed<Schema extends z.ZodType>(schema: Schema, text: string): z.output<Schema> | null {
  try {
    const result = schema.safeParse(JSON.parse(text));

    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function decodedBase64(content: string): string | null {
  try {
    return new TextDecoder().decode(fromBase64(content));
  } catch {
    return null;
  }
}

function readmeOf(page: Readonly<Page>): Readme {
  if (page.cut) return UNREADABLE_README;

  const answer = parsed(ReadmeAnswerSchema, page.text);

  if (answer === null) return UNREADABLE_README;

  if (answer.encoding !== "base64" || !MARKDOWN_NAME.test(answer.name)) return WITHOUT_README;

  const text = decodedBase64(answer.content);

  if (text === null) return UNREADABLE_README;

  return text.trim() === "" ? WITHOUT_README : { kind: "text", text };
}

async function readmeAfter(
  network: Network,
  owner: string,
  name: string,
  deadline: AbortSignal,
): Promise<Readme> {
  const outcome = await getApi(
    network,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/readme`,
    README_POLICY,
    deadline,
  );

  if (outcome.kind === "page") return readmeOf(outcome);

  if (
    outcome.kind === "failed" &&
    outcome.reason === "status" &&
    outcome.httpStatus === NOT_FOUND
  ) {
    return WITHOUT_README;
  }

  return { kind: "failed", status: failureOf(outcome) };
}

export async function fetchedOfRepository(
  network: Network,
  { owner, name }: Readonly<RepositoryRef>,
  deadline: AbortSignal,
): Promise<Fetched> {
  const outcome = await getApi(
    network,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
    API_POLICY,
    deadline,
  );

  if (outcome.kind !== "page") return { status: failureOf(outcome) };

  const answer = parsed(RepositoryAnswerSchema, outcome.text);

  if (answer === null) return { status: "unreadable" };

  const readme = await readmeAfter(network, answer.owner, answer.name, deadline);

  if (readme.kind === "failed") return { status: readme.status };

  return {
    status: "ok",
    found: {
      title: answer.title,
      author: answer.owner,
      community: null,
      content: { kind: "github-repo", repository: answer.repository, readme: readme.text },
    },
  };
}
