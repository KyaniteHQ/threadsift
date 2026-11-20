import { defineRule } from "@oxlint/plugins";
import type { Context, ESTree } from "@oxlint/plugins";
import { z } from "zod";

import { repositoryPath } from "../shared/bindings.ts";
import {
  isBrowserSide,
  isCorePath,
  isMisplaced,
  isServerPath,
  SERVER_ROOTS,
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
  if (!fragment.startsWith("."))
    return fragment.includes("src/core") || fragment.includes("src/features");

  const target = resolveSpecifier(importer, fragment);

  return target !== null && isCorePath(target);
}

function reachesServer(importer: string, fragment: string): boolean {
  if (!isBrowserSide(importer)) return false;

  if (!fragment.startsWith("."))
    return SERVER_ROOTS.some((root) => fragment.includes(root.slice(0, -1)));

  const target = resolveSpecifier(importer, fragment);

  return target !== null && isServerPath(target);
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

  const fragments = stringsIn(argument);

  if (fragments.some((fragment) => reachesCore(importer, fragment))) {
    context.report({ node, messageId: "computed", data: { importer } });
  } else if (fragments.some((fragment) => reachesServer(importer, fragment))) {
    context.report({ node, messageId: "computedServer", data: { importer } });
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
        "Keep the import order of src/core, src/features and src/http, and each feature's entries in tools/core-layout.json (docs/architecture/repository-layout.md, The tree under src).",
    },
    messages: {
      higher:
        "{{importer}} is in {{from}} and cannot import {{target}} in {{to}}, which ranks higher in the import order: contract, kernel, the core halves of the features in the order of tools/core-layout.json, compose, src/http, the http halves of the features, then routes.ts and app.ts. Move the declaration this import needs into {{from}} or a folder before it.",
      hidden:
        "{{target}} is not an entry of {{to}}. Code outside src/features/{{to}}/ imports only the entries listed for it in tools/core-layout.json; import an entry, or add this module to entries (testEntries when only test/, tools/ or smoke/ import it) when the callers need it.",
      sibling:
        "{{importer}} is in {{from}} and {{target}} is in {{to}}. The http halves of two features never import each other; move the shared module to src/http.",
      routeList:
        "{{importer}} imports {{target}}, a module of {{to}}. Outside its own http half, only src/http/routes.ts and src/http/app.ts import an http half; register the route there, and reach it through createApp from anywhere else.",
      browser:
        "{{importer}} runs in the browser or the Extension, which import only src/core/contract; {{target}} is in {{to}}. Move the declaration both sides read into src/core/contract.",
      server:
        "{{importer}} runs in the browser or the Extension, which cannot import src/http, src/features/*/http or src/targets; {{target}} is server code. Put the shape both sides read in src/core/contract.",
      computedServer:
        "{{importer}} runs in the browser or the Extension and loads a module with a computed source that reaches src/http, src/features or src/targets, which it cannot import. Give import() or require() a plain string, and put the shape both sides read in src/core/contract.",
      unplaced:
        "{{importer}} sits where the layout has no place for it. Move it into src/core/contract, src/core/kernel, src/core/compose, a file directly in src/http, or the core or http folder of a feature that order in tools/core-layout.json lists, under src/features.",
      computed:
        "{{importer}} loads a module with a computed source that reaches src/core or src/features, so layer-imports cannot see which module it is. Give import() or require() a plain string.",
    },
  },
  createOnce(context) {
    return {
      Program(node) {
        const importer = repositoryPath(context.filename);

        if (isMisplaced(importer))
          context.report({ node, messageId: "unplaced", data: { importer } });
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
