import { defineRule } from "@oxlint/plugins";
import type { Context, ESTree } from "@oxlint/plugins";
import { z } from "zod";

import { repositoryPath } from "../shared/bindings.ts";
import { isForbidden, serverReach, sourceFileOf } from "../shared/value-imports.ts";

const OptionsSchema = z.object({ forbidden: z.array(z.string()).default([]) });

interface Found {
  forbidden: readonly RegExp[];
}

function startOver(found: Found, options: readonly unknown[]): void {
  const parsed = OptionsSchema.parse(options[0] ?? {});

  found.forbidden = parsed.forbidden.map((pattern) => new RegExp(pattern, "u"));
}

function chainOf(context: Context, found: Found, specifier: string): string | null {
  const target = sourceFileOf(context.filename, specifier);
  const reach = target === null ? null : serverReach(target, found.forbidden);
  const module = reach?.module ?? specifier;

  if (reach === null && !isForbidden(found.forbidden, specifier)) return null;

  const files = [context.filename, ...(reach?.files ?? [])].map((file) => repositoryPath(file));

  return [...files, module].join(" imports ");
}

function check(context: Context, found: Found, node: ESTree.Node, specifier: string): void {
  const chain = chainOf(context, found, specifier);

  if (chain !== null) context.report({ node, messageId: "reachesServer", data: { chain } });
}

function importsValue(node: ESTree.ImportDeclaration): boolean {
  return (
    node.importKind !== "type" &&
    (node.specifiers.length === 0 ||
      node.specifiers.some(
        (specifier) => specifier.type !== "ImportSpecifier" || specifier.importKind !== "type",
      ))
  );
}

function exportsValueFrom(node: ESTree.ExportNamedDeclaration): boolean {
  return (
    node.source !== null &&
    node.exportKind !== "type" &&
    (node.specifiers.length === 0 ||
      node.specifiers.some((specifier) => specifier.exportKind !== "type"))
  );
}

export const noServerValueImportRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Refuse a value import in browser code whose chain of value imports reaches a module that imports server code: the bundler follows every value import and ships what it reaches (docs/agents/changing-code.md, Code).",
    },
    messages: {
      reachesServer:
        "This value import reaches server code: {{chain}}. The bundler ships every module a value import reaches, so import a contract module that holds constants, schemas and types only, move the value into one, or make the import type-only.",
    },
    schema: [z.toJSONSchema(OptionsSchema, { target: "draft-4", io: "input" })],
  },
  createOnce(context) {
    const found: Found = { forbidden: [] };

    return {
      before() {
        startOver(found, context.options);
      },
      ImportDeclaration(node) {
        if (importsValue(node)) check(context, found, node, node.source.value);
      },
      ExportNamedDeclaration(node) {
        if (node.source !== null && exportsValueFrom(node)) {
          check(context, found, node, node.source.value);
        }
      },
      ExportAllDeclaration(node) {
        if (node.exportKind !== "type") check(context, found, node, node.source.value);
      },
      ImportExpression(node) {
        const source = z
          .string()
          .safeParse(node.source.type === "Literal" ? node.source.value : null);

        if (source.success) check(context, found, node, source.data);
      },
    };
  },
});
