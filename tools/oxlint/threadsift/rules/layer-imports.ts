import { defineRule } from "@oxlint/plugins";
import type { Context, ESTree } from "@oxlint/plugins";
import { z } from "zod";

import { repositoryPath } from "../shared/bindings.ts";
import {
  isCorePath,
  isPlaced,
  placeOf,
  resolveSpecifier,
  violationOf,
} from "../shared/core-layout.ts";

function check(context: Context, node: ESTree.Node, specifier: string): void {
  const importer = repositoryPath(context.filename);
  const target = resolveSpecifier(importer, specifier);
  const violation = target === null ? null : violationOf(importer, target);

  if (violation !== null) context.report({ node, ...violation });
}

function stringsIn(node: ESTree.Node | null | undefined): string[] {
  if (node === null || node === undefined) return [];

  if (node.type === "Literal") {
    const text = z.string().safeParse(node.value);

    return text.success ? [text.data] : [];
  }

  if (node.type === "TemplateLiteral") {
    return [
      ...node.quasis.map((quasi) => quasi.value.cooked ?? ""),
      ...node.expressions.flatMap((expression) => stringsIn(expression)),
    ];
  }

  if (node.type === "BinaryExpression") return [...stringsIn(node.left), ...stringsIn(node.right)];

  if (node.type === "CallExpression") {
    return [...stringsIn(node.callee), ...node.arguments.flatMap((part) => stringsIn(part))];
  }

  return node.type === "MemberExpression" ? stringsIn(node.object) : [];
}

function reachesCore(importer: string, fragment: string): boolean {
  if (!fragment.startsWith(".")) return fragment.includes("src/core");

  const target = resolveSpecifier(importer, fragment);

  return target !== null && isCorePath(target);
}

function checkLoaded(context: Context, node: ESTree.Node, argument: ESTree.Node | undefined): void {
  const plain =
    argument?.type === "Literal" ||
    (argument?.type === "TemplateLiteral" && argument.expressions.length === 0);

  if (plain) {
    const [specifier = ""] = stringsIn(argument);

    check(context, node, specifier);

    return;
  }

  const importer = repositoryPath(context.filename);

  if (stringsIn(argument).some((fragment) => reachesCore(importer, fragment))) {
    context.report({ node, messageId: "computed", data: { importer } });
  }
}

function isRequireCall(node: ESTree.CallExpression): boolean {
  const { callee } = node;

  return (
    (callee.type === "Identifier" && callee.name === "require") ||
    (callee.type === "CallExpression" &&
      callee.callee.type === "Identifier" &&
      callee.callee.name === "createRequire")
  );
}

export const layerImportsRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Keep the import order of the src/core folders and each feature's entries in tools/core-layout.json (docs/architecture/repository-layout.md, The folders of src/core).",
    },
    messages: {
      higher:
        "{{importer}} is in {{from}}, which comes before {{to}} in the order of tools/core-layout.json, so it cannot import {{target}}. Move the declaration that this import needs into {{from}} or a folder before it.",
      hidden:
        "{{target}} is not an entry of {{to}}. Code outside {{to}} imports only the entries listed for it in tools/core-layout.json; import an entry, or add this module to entries (testEntries when only test/, tools/ or smoke/ import it) when the callers need it.",
      browser:
        "{{importer}} runs in the browser or the Extension, which import only src/core/contract; {{target}} is in {{to}}.",
      unplaced:
        "{{importer}} is not listed under the folder it sits in, in modules of tools/core-layout.json. Every src/core module sits in one folder of order and is listed there.",
      computed:
        "{{importer}} loads a module with a computed source that reaches src/core, so layer-imports cannot see which module it is. Give import() or require() a plain string.",
    },
  },
  createOnce(context) {
    return {
      Program(node) {
        const importer = repositoryPath(context.filename);
        const place = placeOf(importer);

        if (place !== null && !isPlaced(place)) {
          context.report({ node, messageId: "unplaced", data: { importer } });
        }
      },
      ImportDeclaration(node) {
        check(context, node, node.source.value);
      },
      ExportNamedDeclaration(node) {
        if (node.source !== null) check(context, node, node.source.value);
      },
      ExportAllDeclaration(node) {
        check(context, node, node.source.value);
      },
      TSImportType(node) {
        check(context, node, node.source.value);
      },
      ImportExpression(node) {
        checkLoaded(context, node, node.source);
      },
      CallExpression(node) {
        if (isRequireCall(node)) checkLoaded(context, node, node.arguments[0]);
      },
    };
  },
});
