import { z } from "zod";

function alternativesAt(error: z.ZodError, index: number): readonly z.ZodError[] {
  const issue = error.issues[index];

  if (issue?.code !== "invalid_union") return [];

  return issue.errors.map(
    (alternative) =>
      new z.ZodError(
        alternative.map((nested) => ({ ...nested, path: [...issue.path, ...nested.path] })),
      ),
  );
}

export function reasonsOf(error: z.ZodError): string {
  return error.issues
    .map((issue, index) => {
      const where = issue.path.join(".") || "body";
      const alternatives = alternativesAt(error, index);

      if (alternatives.length === 0) return `${where}: ${issue.message}`;

      const reasons = alternatives.map((nested) => `[${reasonsOf(nested)}]`);

      return `${where}: no accepted form fits, ${reasons.join(" or ")}`;
    })
    .join("; ");
}

interface SchemaNode {
  readonly properties?: Readonly<Record<string, SchemaNode>> | undefined;
  readonly items?: SchemaNode | undefined;
  readonly anyOf?: readonly SchemaNode[] | undefined;
}

const SchemaNodeSchema: z.ZodType<SchemaNode> = z.lazy(() =>
  z.looseObject({
    properties: z.record(z.string(), SchemaNodeSchema).optional(),
    items: SchemaNodeSchema.optional(),
    anyOf: z.array(SchemaNodeSchema).optional(),
  }),
);

function namesIn(node: Readonly<SchemaNode>): readonly string[] {
  const nested = [...Object.values(node.properties ?? {}), ...(node.anyOf ?? [])];

  if (node.items !== undefined) nested.push(node.items);

  return Object.keys(node.properties ?? {}).concat(nested.flatMap((child) => namesIn(child)));
}

export function fieldNamesOf(...schemas: readonly z.ZodType[]): readonly string[] {
  return schemas.flatMap((schema) =>
    namesIn(
      SchemaNodeSchema.parse(z.toJSONSchema(schema, { io: "input", unrepresentable: "any" })),
    ),
  );
}

function shown(key: string, known: readonly string[]): string {
  if (/^\d+$/u.test(key)) return "#";

  return known.includes(key) ? key : "*";
}

export function issueCodesOf(error: z.ZodError, known: readonly string[]): string {
  return error.issues
    .map((issue, index) => {
      const where = issue.path.map((key) => shown(String(key), known)).join(".");
      const alternatives = alternativesAt(error, index);

      if (alternatives.length === 0) return `${issue.code}@${where}`;

      const codes = alternatives.map((nested) => issueCodesOf(nested, known));

      return `${issue.code}@${where}[${codes.join("|")}]`;
    })
    .join(" ");
}
