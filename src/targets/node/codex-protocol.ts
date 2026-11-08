import { z } from "zod";

import { type AiExecution, refusedAi } from "../../core/ai-contract.ts";
import { apiRefusal } from "../shared/ai-call.ts";
import { parsedJson } from "./cli-support.ts";

const CatalogSchema = z
  .looseObject({
    models: z
      .array(
        z
          .looseObject({
            slug: z.string(),
            tool_mode: z.string().nullable().optional(),
            apply_patch_tool_type: z.string().nullable(),
            shell_type: z.string(),
            experimental_supported_tools: z.array(z.string()).readonly(),
          })
          .readonly(),
      )
      .readonly(),
  })
  .readonly();

const EventSchema = z
  .looseObject({
    type: z.string(),
    item: z.looseObject({ type: z.string(), text: z.string().optional() }).readonly().optional(),
    error: z.looseObject({ message: z.string() }).readonly().optional(),
  })
  .readonly();

export type Catalog = z.infer<typeof CatalogSchema>;

type Events = readonly z.infer<typeof EventSchema>[];

export function readCatalog(stdout: string): Catalog | null {
  return parsedJson(CatalogSchema, stdout);
}

export function listsModel(catalog: Catalog, model: string): boolean {
  return catalog.models.some(({ slug }) => slug === model);
}

export function toolless(catalog: Catalog): string {
  return JSON.stringify({
    ...catalog,
    models: catalog.models.map((model) => ({
      ...model,
      tool_mode: null,
      apply_patch_tool_type: null,
      shell_type: "disabled",
      experimental_supported_tools: [],
    })),
  });
}

function eventsOf(stdout: string): Events {
  return stdout
    .split("\n")
    .map((line) => parsedJson(EventSchema, line))
    .filter((event) => event !== null);
}

function lastAnswer(events: Events): string | null {
  const messages = events.flatMap(({ type, item }) =>
    type === "item.completed" && item?.type === "agent_message" && item.text !== undefined
      ? [item.text]
      : [],
  );

  return messages.at(-1) ?? null;
}

function failureOf(events: Events): string | null {
  return events.find(({ type }) => type === "turn.failed")?.error?.message ?? null;
}

const HTTP_STATUS = /unexpected status (\d{3})/u;
const REJECTED_LOGIN = /could not be refreshed|sign in again/iu;
const UNKNOWN_MODEL = /model is not supported/iu;
const BUSY = /hit your usage limit|at capacity|exceeded retry limit/iu;
const FILTERED = /content_filter/iu;

function failureRefusal(message: string) {
  const status = HTTP_STATUS.exec(message)?.[1];

  if (status !== undefined) return apiRefusal(Number(status));

  if (REJECTED_LOGIN.test(message)) return apiRefusal(401);

  if (UNKNOWN_MODEL.test(message)) return apiRefusal(404);

  if (BUSY.test(message)) return apiRefusal(429);

  return FILTERED.test(message) ? refusedAi("declined") : null;
}

function accepted<Result>(schema: z.ZodType<Result>, answer: string): AiExecution<Result> {
  const parsed = schema.safeParse(parsedJson(z.unknown(), answer));

  return parsed.success ? { kind: "done", result: parsed.data } : refusedAi("no-json");
}

export function outputSchema(schema: z.ZodType): string {
  return JSON.stringify(z.toJSONSchema(schema, { target: "draft-7" }));
}

export const UNKNOWN_MODEL_REFUSAL = apiRefusal(404);

export function readOutcome<Result>(
  schema: z.ZodType<Result>,
  stdout: string,
  code: number | null,
): AiExecution<Result> | null {
  const events = eventsOf(stdout);
  const failure = failureOf(events);

  if (failure === null && code === 0) {
    const answer = lastAnswer(events);

    return answer === null ? refusedAi("no-json") : accepted(schema, answer);
  }

  return failure === null ? null : failureRefusal(failure);
}
