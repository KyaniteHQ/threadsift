import { z } from "zod";

import { BudgetRefusalSchema } from "../../src/core/contract/error-wire.ts";
import { SavedItemResponseSchema } from "../../src/core/contract/item-route-wire.ts";
import { type SaveItemInput, SaveRefusalSchema } from "../../src/core/contract/save-wire.ts";
import { UNSUPPORTED_PAGE_LINK } from "../../src/core/contract/supplied-page.ts";
import { type Config, instanceAnswer, instanceRequest } from "./config.ts";
import { logFailure } from "./log.ts";
import type { Completeness, Fetched } from "./reddit-thread.ts";
import type { SaveState } from "./state.ts";
import type { ThreadBody } from "./thread-body.ts";

const SavedSchema = SavedItemResponseSchema.pick({ url: true });

const UNKNOWN_STRING_IS_ABSENT = z.string().transform((): undefined => undefined);

const TolerantRefusalSchema = SaveRefusalSchema.extend({
  fetch: SaveRefusalSchema.shape.fetch.or(UNKNOWN_STRING_IS_ABSENT),
  code: SaveRefusalSchema.shape.code.or(UNKNOWN_STRING_IS_ABSENT),
});

const BudgetSpentSchema = BudgetRefusalSchema.extend({ fetch: z.string().optional() });

const SAVED_KIND = {
  whole: "saved",
  "replies-missing": "saved-incomplete",
  "page-only": "saved-page",
} as const satisfies Record<Completeness, SaveState["kind"]>;

type PageBody = Readonly<Pick<SaveItemInput, "url"> & { page: NonNullable<SaveItemInput["page"]> }>;

type Saving = Fetched<ThreadBody | PageBody>;

function refusedState(refusal: Readonly<z.output<typeof TolerantRefusalSchema>> | null): SaveState {
  if (refusal?.fetch === "refused") return { kind: "private-link" };

  return refusal?.code === UNSUPPORTED_PAGE_LINK
    ? { kind: "unsupported-link" }
    : { kind: "failed" };
}

async function stateOf(
  response: Response,
  origin: string,
  completeness: Completeness,
): Promise<SaveState> {
  switch (response.status) {
    case 200:
    case 201: {
      const saved = await instanceAnswer(response, SavedSchema);

      if (saved === null) return { kind: "failed" };

      const itemUrl = URL.parse(saved.url, origin)?.href;

      if (itemUrl === undefined) {
        logFailure("save-request-failed", new Error("the saved address does not parse"));

        return { kind: "failed" };
      }

      return { kind: SAVED_KIND[completeness], itemUrl };
    }

    case 400:
      return refusedState(await instanceAnswer(response, TolerantRefusalSchema));
    case 401:
      return { kind: "token-refused" };
    case 403:
      return { kind: "scope-refused" };
    case 409:
      return { kind: "thread-kept" };
    case 413:
      return { kind: "too-large" };
    case 429:
      return (await instanceAnswer(response, BudgetSpentSchema)) === null
        ? { kind: "failed" }
        : { kind: "budget-spent" };
    default:
      return { kind: "failed" };
  }
}

export async function send(
  config: Readonly<Config>,
  { body, completeness }: Readonly<Saving>,
): Promise<SaveState> {
  const reply = await instanceRequest(config, "/api/items", {
    method: "POST",
    body,
    event: "save-request-failed",
  });

  if (reply.kind === "answered") return stateOf(reply.response, config.origin, completeness);

  return { kind: reply.failure === "unknown" ? "unreachable" : reply.failure };
}
