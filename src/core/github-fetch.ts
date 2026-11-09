import { z } from "zod";

import type { Fetched } from "./details.ts";
import { fromBase64 } from "./encoding.ts";
import { type FetchPolicy, type GuardOutcome, type Page, loggedFailureOf } from "./fetch-guard.ts";
import type { FetchFailure } from "./fetch-results.ts";
import { type GithubRun, UNAUTHORIZED, type Waiting, apiPolicy, requestApi } from "./github-api.ts";
import { parsedJson } from "./parsed-json.ts";
import type { RepositoryRef } from "./repository-ref.ts";

const NOT_FOUND = 404;
const MARKDOWN_NAME = /\.(?:md|markdown)$/iu;
const NO_LICENSE = "NOASSERTION";
const README_ANSWER_BYTES = 768 * 1024;

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
    private: z.boolean().default(false),
  })
  .transform((answer) => {
    const spdx = answer.license?.spdx_id ?? null;

    return {
      owner: answer.owner.login,
      name: answer.name,
      title: answer.full_name,
      private: answer.private,
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
  | { readonly kind: "failed"; readonly status: FetchFailure }
  | Waiting;

const TOKEN_REJECTED = "github-token";

const WITHOUT_README: Readme = { kind: "text", text: null };

const UNREADABLE_README: Readme = { kind: "failed", status: "unreadable" };

function decodedBase64(content: string): string | null {
  try {
    return new TextDecoder().decode(fromBase64(content));
  } catch {
    return null;
  }
}

function readmeOf(page: Readonly<Page>): Readme {
  if (page.cut) return UNREADABLE_README;

  const answer = parsedJson(ReadmeAnswerSchema, page.text);

  if (answer === null) return UNREADABLE_README;

  if (answer.encoding !== "base64" || !MARKDOWN_NAME.test(answer.name)) return WITHOUT_README;

  const text = decodedBase64(answer.content);

  if (text === null) return UNREADABLE_README;

  return text.trim() === "" ? WITHOUT_README : { kind: "text", text };
}

function failureOf(outcome: Exclude<GuardOutcome, Page>, tokenSent: boolean): FetchFailure {
  const rejected =
    tokenSent &&
    outcome.kind === "failed" &&
    outcome.reason === "status" &&
    outcome.httpStatus === UNAUTHORIZED;

  return rejected ? TOKEN_REJECTED : loggedFailureOf(outcome);
}

function waitingFetched({ until, limited }: Readonly<Waiting>): Fetched {
  return { status: "waiting", until, limited };
}

async function readmeAfter(
  run: Readonly<GithubRun>,
  owner: string,
  name: string,
  policy: Readonly<FetchPolicy>,
  tokenSent: boolean,
  deadline: AbortSignal,
): Promise<Readme> {
  const outcome = await requestApi(
    run,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/readme`,
    { ...policy, dataMaxBytes: README_ANSWER_BYTES },
    deadline,
  );

  if (outcome.kind === "page") return readmeOf(outcome);

  if (outcome.kind === "waiting") return outcome;

  if (
    outcome.kind === "failed" &&
    outcome.reason === "status" &&
    outcome.httpStatus === NOT_FOUND
  ) {
    return WITHOUT_README;
  }

  return { kind: "failed", status: failureOf(outcome, tokenSent) };
}

export async function fetchedOfRepository(
  run: Readonly<GithubRun>,
  { owner, name }: Readonly<RepositoryRef>,
  deadline: AbortSignal,
): Promise<Fetched> {
  const { auth } = run;

  if (auth.kind === "unreadable") return { status: TOKEN_REJECTED };

  const tokenSent = auth.kind === "token";
  const policy = apiPolicy(tokenSent ? auth.token : null);

  const outcome = await requestApi(
    run,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
    policy,
    deadline,
  );

  if (outcome.kind === "waiting") return waitingFetched(outcome);

  if (outcome.kind !== "page") return { status: failureOf(outcome, tokenSent) };

  const answer = parsedJson(RepositoryAnswerSchema, outcome.text);

  if (answer === null) return { status: "unreadable" };

  if (answer.private) return { status: "status" };

  const readme = await readmeAfter(run, answer.owner, answer.name, policy, tokenSent, deadline);

  if (readme.kind === "waiting") return waitingFetched(readme);

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
