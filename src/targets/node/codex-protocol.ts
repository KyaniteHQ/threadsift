import { z } from "zod";

import { type AiExecution, apiRefusal, refusedAi } from "../../core/contract/ai-contract.ts";
import { splitLines } from "../../core/contract/format.ts";
import { parsedJson } from "../../core/kernel/parsed-json.ts";
import type { ExitedEnd, SignIn } from "./cli-sign-in.ts";

const CatalogSchema = z
  .looseObject({
    models: z
      .array(
        z
          .looseObject({
            slug: z.string(),
            priority: z.number(),
            visibility: z.string(),
            supported_reasoning_levels: z.array(z.looseObject({ effort: z.string() })),
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

const LabelSchema = z.string().min(1).optional();

const ToolSchema = z
  .looseObject({
    type: z.string(),
    name: z.string().optional(),
    tools: z
      .array(z.looseObject({ type: z.string(), name: z.string().optional() }).readonly())
      .readonly()
      .optional(),
  })
  .readonly();

const PromptItemSchema = z
  .looseObject({
    type: z.string(),
    tools: z.array(ToolSchema).readonly().optional(),
    content: z
      .array(z.looseObject({ text: z.string().optional() }).readonly())
      .readonly()
      .optional(),
  })
  .readonly();

const PromptInputSchema = z.array(PromptItemSchema).readonly();

const EventSchema = z
  .looseObject({
    type: z.string(),
    item: z.looseObject({ type: z.string(), text: z.string().optional() }).readonly().optional(),
    error: z.looseObject({ message: z.string() }).readonly().optional(),
  })
  .readonly();

type Events = readonly z.infer<typeof EventSchema>[];

const TOOLLESS = {
  tool_mode: null,
  apply_patch_tool_type: null,
  shell_type: "disabled",
  experimental_supported_tools: [],
};

export interface ToollessCatalog {
  readonly bytes: string;
  readonly models: readonly {
    readonly visible: boolean;
    readonly slug: string;
    readonly label: string | undefined;
    readonly levels: readonly string[];
  }[];
}

export function toollessCatalog(stdout: string): ToollessCatalog | null {
  const catalog = parsedJson(CatalogSchema, stdout);

  if (catalog === null) return null;

  return {
    models: catalog.models
      .toSorted((a, b) => a.priority - b.priority)
      .flatMap(({ slug, display_name: name, visibility, supported_reasoning_levels }) => {
        const label = LabelSchema.safeParse(name);

        return label.success
          ? [
              {
                visible: visibility === "list",
                slug,
                label: label.data,
                levels: supported_reasoning_levels.map(({ effort }) => effort),
              },
            ]
          : [];
      }),
    bytes: JSON.stringify({
      ...catalog,
      models: catalog.models.map((model) => Object.assign({}, model, TOOLLESS)),
    }),
  };
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

export const SURFACE_PROMPT = "Reply with one word.";

const ALLOWED_TOOLS = new Set(["functions.request_user_input"]);

const BASE_TEXT = [
  "You are Codex, an agent based on ",
  "<permissions instructions>",
  "<collaboration_mode>",
  "<environment_context>",
];

interface Surface {
  readonly extraTools: readonly string[];
  readonly foreignTexts: number;
}

function toolNames({ tools }: Readonly<z.infer<typeof PromptItemSchema>>): string[] {
  return (tools ?? []).flatMap((entry) =>
    entry.tools === undefined
      ? [`${entry.type}.${entry.name ?? ""}`]
      : entry.tools.map((tool) => `${entry.name ?? entry.type}.${tool.name ?? tool.type}`),
  );
}

function isBaseText(text: string): boolean {
  return text === SURFACE_PROMPT || BASE_TEXT.some((prefix) => text.startsWith(prefix));
}

function foreignCount(items: z.infer<typeof PromptInputSchema>): number {
  return items.reduce((count, { type, content }) => {
    if (type !== "message" && type !== "additional_tools") return count + 1;

    return count + (content ?? []).filter(({ text }) => !isBaseText(text ?? "")).length;
  }, 0);
}

export function surfaceOf(stdout: string): Surface | null {
  const items = parsedJson(PromptInputSchema, stdout);

  if (items === null) return null;

  return {
    extraTools: items.flatMap((item) => toolNames(item)).filter((name) => !ALLOWED_TOOLS.has(name)),
    foreignTexts: foreignCount(items),
  };
}

const NOT_LOGGED_IN = "Not logged in";

export function loginStatusOf({ code, stderr }: Readonly<ExitedEnd>): SignIn {
  if (code === 0) return "signed-in";

  const signedOut = code === 1 && splitLines(stderr).some((line) => line.trim() === NOT_LOGGED_IN);

  return signedOut ? "signed-out" : "unknown";
}
