import { z } from "zod";

export function reasonsOf(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const where = issue.path.join(".") || "body";

      if (issue.code !== "invalid_union" || issue.errors.length === 0) {
        return `${where}: ${issue.message}`;
      }

      const alternatives = issue.errors.map((alternative) => {
        const placed = alternative.map((nested) => ({
          ...nested,
          path: [...issue.path, ...nested.path],
        }));

        return `[${reasonsOf(new z.ZodError(placed))}]`;
      });

      return `${where}: no accepted form fits, ${alternatives.join(" or ")}`;
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
    .map((issue) => {
      const where = issue.path.map((key) => shown(String(key), known)).join(".");

      if (issue.code !== "invalid_union" || issue.errors.length === 0) {
        return `${issue.code}@${where}`;
      }

      const alternatives = issue.errors.map((alternative) =>
        issueCodesOf(
          new z.ZodError(
            alternative.map((nested) => ({ ...nested, path: [...issue.path, ...nested.path] })),
          ),
          known,
        ),
      );

      return `${issue.code}@${where}[${alternatives.join("|")}]`;
    })
    .join(" ");
}
