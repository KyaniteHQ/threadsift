import { dirname, posix, relative, resolve, sep } from "node:path";

import type { Context, Definition, ESTree, Scope } from "@oxlint/plugins";

export type Trusted = ReadonlyMap<string, ReadonlySet<string>>;

const MAX_ALIAS_DEPTH = 4;

export function repositoryPath(cwd: string, file: string): string {
  return relative(cwd, file).split(sep).join(posix.sep);
}

function definitionOf(context: Context, identifier: ESTree.IdentifierReference): Definition | null {
  let scope: Scope | null = context.sourceCode.getScope(identifier);

  while (scope !== null) {
    const variable = scope.set.get(identifier.name);

    if (variable !== undefined) return variable.defs[0] ?? null;

    scope = scope.upper;
  }

  return null;
}

export function caughtBy(
  context: Context,
  thrown: ESTree.Expression,
  depth = 0,
): ESTree.CatchClause | null {
  if (thrown.type !== "Identifier" || depth > MAX_ALIAS_DEPTH) return null;

  const definition = definitionOf(context, thrown);

  if (definition === null) return null;

  const { node, parent } = definition;

  if (definition.type === "CatchClause") return node.type === "CatchClause" ? node : null;

  const aliasing =
    definition.type === "Variable" &&
    node.type === "VariableDeclarator" &&
    parent?.type === "VariableDeclaration" &&
    parent.kind === "const";

  return aliasing && node.init !== null ? caughtBy(context, node.init, depth + 1) : null;
}

export function isTrusted(
  context: Context,
  trusted: Trusted,
  callee: ESTree.IdentifierReference,
): boolean {
  const definition = definitionOf(context, callee);

  if (definition?.type === "FunctionName") {
    return trusted.get(repositoryPath(context.cwd, context.filename))?.has(callee.name) === true;
  }

  if (definition?.type !== "ImportBinding") return false;

  const { node, parent } = definition;

  if (node.type !== "ImportSpecifier" || parent?.type !== "ImportDeclaration") return false;

  const from = parent.source.value;

  if (!from.startsWith(".") || node.imported.type !== "Identifier") return false;

  const module = repositoryPath(context.cwd, resolve(dirname(context.filename), from));

  return trusted.get(module)?.has(node.imported.name) === true;
}

export function undeclaredNames(
  program: ESTree.Program,
  names: ReadonlySet<string> | undefined,
): string[] {
  const declared = new Set(
    program.body.flatMap((statement) => {
      const declaration =
        statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;

      return declaration?.type === "FunctionDeclaration" && declaration.id !== null
        ? [declaration.id.name]
        : [];
    }),
  );

  return [...(names ?? [])].filter((name) => !declared.has(name));
}
