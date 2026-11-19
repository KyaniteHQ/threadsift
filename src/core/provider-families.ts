import { z } from "zod";

import { SECRET_INPUT_MAX } from "./secret-input.ts";

export const AI_URL_MAX = 2048;
export const AI_MODEL_MAX = 240;

const Model = z.string().trim().min(1).max(AI_MODEL_MAX);
const Key = z.string().min(1).max(SECRET_INPUT_MAX).optional();
const CliModel = z.string().trim().max(AI_MODEL_MAX);
const CliEffort = z
  .string()
  .trim()
  .transform((value) => (value === "" ? undefined : value))
  .optional();

export const CLI_CHOICES = ["recommended", "cli-defaults", "custom"] as const;
export const CliChoiceSchema = z.enum(CLI_CHOICES);
export type CliChoice = z.infer<typeof CliChoiceSchema>;

export const CliPreferenceSchema = z.discriminatedUnion("choice", [
  z.strictObject({ choice: z.literal("recommended") }),
  z.strictObject({ choice: z.literal("cli-defaults") }),
  z
    .strictObject({ choice: z.literal("custom"), model: CliModel.default(""), effort: CliEffort })
    .refine(({ model, effort }) => model !== "" || effort !== undefined, {
      message: "Custom requires a model or effort.",
    }),
]);

interface FamilyFacts {
  readonly id: string;
  readonly label: string;
  readonly url: string | null;
  readonly fields: Readonly<Record<string, z.ZodType>>;
}

interface HttpFamily extends FamilyFacts {
  readonly kind: "http";
  readonly input: z.ZodType;
}

interface BindingFamily extends FamilyFacts {
  readonly kind: "binding";
  readonly input: z.ZodType;
}

interface CliFamily extends FamilyFacts {
  readonly kind: "cli";
}

interface BotFamily extends FamilyFacts {
  readonly kind: "bot";
  readonly input: z.ZodType;
}

type Family = HttpFamily | BindingFamily | CliFamily | BotFamily;

type Fields = Readonly<Record<string, z.ZodType>>;

function namesOf<const FieldSet extends Fields>(fields: FieldSet) {
  return Object.keys(fields).filter((name): name is keyof FieldSet & string => name in fields);
}

function httpFamily<
  const Id extends string,
  const Label extends string,
  const Url extends string | null,
  const FieldSet extends Fields,
>(family: {
  readonly id: Id;
  readonly label: Label;
  readonly url: Url;
  readonly fields: FieldSet;
}) {
  return {
    kind: "http",
    ...family,
    names: namesOf(family.fields),
    input: z.strictObject({ provider: z.literal(family.id), ...family.fields }),
  } as const;
}

function keyedFamily<const Id extends string, const Url extends string>(id: Id, url: Url) {
  return httpFamily({
    id,
    label: id,
    url,
    fields: { model: Model, key: Key },
  });
}

function cliFamily<const Id extends string, const Label extends string>(id: Id, label: Label) {
  const fields = { model: CliModel, effort: CliEffort };

  return { kind: "cli", id, label, url: null, names: namesOf(fields), fields } as const;
}

function bindingFamily<const Id extends string, const Label extends string>(id: Id, label: Label) {
  const fields = { model: Model };

  return {
    kind: "binding",
    id,
    label,
    url: null,
    names: namesOf(fields),
    fields,
    input: z.strictObject({ provider: z.literal(id), ...fields }),
  } as const;
}

function botFamily<const Id extends string, const Label extends string>(id: Id, label: Label) {
  const fields = {};

  return {
    kind: "bot",
    id,
    label,
    url: null,
    names: namesOf(fields),
    fields,
    input: z.strictObject({ provider: z.literal(id) }),
  } as const;
}

function described<
  const Families extends { readonly [Id in keyof Families]: Family & { readonly id: Id } },
>(families: Families): Families {
  return families;
}

export const PROVIDERS = described({
  "openai-compatible": httpFamily({
    id: "openai-compatible",
    label: "compatible",
    url: null,
    fields: { baseUrl: z.url().max(AI_URL_MAX), model: Model, key: Key },
  }),
  openrouter: keyedFamily("openrouter", "https://openrouter.ai/api/v1"),
  anthropic: keyedFamily("anthropic", "https://api.anthropic.com/v1"),
  openai: keyedFamily("openai", "https://api.openai.com/v1"),
  xai: keyedFamily("xai", "https://api.x.ai/v1"),
  "workers-ai": bindingFamily("workers-ai", "workersAi"),
  "claude-code": cliFamily("claude-code", "claudeCode"),
  codex: cliFamily("codex", "codex"),
  "grok-bot": botFamily("grok-bot", "grokBot"),
});

const FAMILIES = Object.values(PROVIDERS);

type Kind = Family["kind"];

type FamilyOf<Of extends Kind> = Extract<(typeof FAMILIES)[number], { readonly kind: Of }>;

export type ProviderOf<Of extends Kind> = FamilyOf<Of>["id"];

export function familiesOf<const Of extends Kind>(
  ...kinds: readonly Of[]
): readonly FamilyOf<Of>[] {
  return FAMILIES.filter((family): family is FamilyOf<Of> =>
    kinds.some((kind) => kind === family.kind),
  );
}

const [firstStored, ...otherStored] = familiesOf("http", "binding", "cli").map(({ id }) => id);

if (firstStored === undefined) throw new Error("No Provider family is stored in settings");

export const STORED_PROVIDERS = [firstStored, ...otherStored] as const;

export const KEYLESS_PROVIDERS = familiesOf("binding", "cli").map(({ id }) => id);

export const HttpProviderSchema = z.enum(familiesOf("http").map(({ id }) => id));
export const BindingProviderSchema = z.enum(familiesOf("binding").map(({ id }) => id));
export const CliProviderSchema = z.enum(familiesOf("cli").map(({ id }) => id));
export const ProviderSchema = z.enum([
  ...STORED_PROVIDERS,
  ...familiesOf("bot").map(({ id }) => id),
]);

export type HttpProvider = z.infer<typeof HttpProviderSchema>;
export type BindingProvider = z.infer<typeof BindingProviderSchema>;
export type CliProvider = z.infer<typeof CliProviderSchema>;
export type Provider = z.infer<typeof ProviderSchema>;

export const GROK_BOT_PROVIDER = PROVIDERS["grok-bot"].id;

export function isCliProvider(provider: string): provider is CliProvider {
  return CliProviderSchema.safeParse(provider).success;
}

export function hasKind<const Of extends Kind, Input extends { readonly provider: Provider }>(
  kind: Of,
  input: Input,
): input is Input & { readonly provider: ProviderOf<Of> } {
  return PROVIDERS[input.provider].kind === kind;
}

export function withoutTrailingSlashes(url: string): string {
  return url.replace(/\/+$/u, "");
}
