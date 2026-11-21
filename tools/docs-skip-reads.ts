import { posix } from "node:path";

import { parseSync, Visitor, type ESTree } from "vite";
import { z } from "zod";

type Immutable<T> = { readonly [Key in keyof T]: Immutable<T[Key]> };
type Argument = Immutable<ESTree.Argument>;
type Found = (path: string, line: number) => void;

function name(node: Argument): string | undefined {
  if (node.type === "Identifier") return node.name;
  if (node.type === "MemberExpression" && !node.computed) return node.property.name;
  return undefined;
}

function pathResolver(file: string, source: string, binding: (key: string) => string | undefined) {
  const directory = posix.dirname(file);
  function value(node?: Argument): string | undefined {
    if (!node) return undefined;
    const text = source.slice(node.start, node.end);
    if (text === "import.meta.dirname" || text === "__dirname") return directory;
    if (text === "process.cwd()") return ".";
    if (node.type === "Literal") return z.string().safeParse(node.value).data;
    if (node.type === "Identifier") {
      return binding(node.name);
    }
    if (node.type === "TemplateLiteral") {
      let result = node.quasis[0]?.value.cooked ?? "";
      for (const [i, expr] of node.expressions.entries()) {
        const part = value(expr);
        if (part === undefined) return undefined;
        result += part + (node.quasis[i + 1]?.value.cooked ?? "");
      }
      return result;
    }
    if (node.type === "NewExpression" && name(node.callee) === "URL") {
      const [relative, base] = node.arguments;
      const path = value(relative);
      if (path !== undefined && base && source.slice(base.start, base.end) === "import.meta.url") {
        return posix.join(directory, path);
      }
    }
    if (node.type !== "CallExpression") return undefined;
    const operation = name(node.callee);
    if (operation === "fileURLToPath") return value(node.arguments[0]);
    if (operation === "join" || operation === "resolve") {
      const parts = node.arguments.map((argument) => value(argument));
      if (parts.every((part) => part !== undefined)) {
        return operation === "join"
          ? posix.join(...parts)
          : posix.relative(process.cwd(), posix.resolve(...parts));
      }
    }
    return undefined;
  }

  return value;
}

function rootSuffix(arg: Argument): string | undefined {
  if (
    arg.type !== "TemplateLiteral" ||
    arg.expressions.length !== 1 ||
    arg.quasis[0]?.value.raw !== ""
  )
    return undefined;
  const base = arg.expressions[0];
  const tail = arg.quasis[1]?.value.cooked ?? "";
  return base?.type === "Identifier" &&
    /^(?:repo_?)?root$/iu.test(base.name) &&
    tail.startsWith("/")
    ? tail.slice(1)
    : undefined;
}

function reportLocation(source: string, found: Found) {
  const emitted = new Set<string>();
  return function report(node: Readonly<{ start: number }>, path: string): void {
    const line = source.slice(0, node.start).split("\n").length;
    const key = `${String(line)}:${path}`;
    if (emitted.has(key)) return;
    emitted.add(key);
    found(path, line);
  };
}

export function checkReads(file: string, source: string, found: Found): void {
  const scopes = [new Map<string, string | undefined>()];
  const { program, errors } = parseSync(file, source);
  if (errors.length > 0) throw new Error(`${file}: ${errors[0]?.message}`);

  const value = pathResolver(file, source, (key) =>
    scopes.findLast((scope) => scope.has(key))?.get(key),
  );
  const report = reportLocation(source, found);

  new Visitor({
    BlockStatement() {
      scopes.push(new Map());
    },
    "BlockStatement:exit"() {
      scopes.pop();
    },
    VariableDeclaration(node) {
      for (const { id, init } of node.declarations) {
        if (id.type === "Identifier")
          scopes.at(-1)?.set(id.name, node.kind === "const" && init ? value(init) : undefined);
      }
    },
    NewExpression(node) {
      const path = value(node);
      if (path !== undefined) report(node, path);
    },
    ImportDeclaration(node) {
      if (node.source.value.startsWith("."))
        report(node.source, posix.join(posix.dirname(file), node.source.value));
    },
    CallExpression(node) {
      const operation = name(node.callee) ?? "";
      if (
        !/^(?:readFile|readText|open|opendir|readdir|glob|stat|lstat|access|exists|cp|copyFile|createReadStream)(?:Sync)?$/u.test(
          operation,
        )
      )
        return;
      const [arg] = node.arguments;
      if (!arg) return;
      const path = value(arg);
      if (path !== undefined) report(arg, path);
      const suffix = rootSuffix(arg);
      if (suffix !== undefined && posix.normalize(path ?? "") !== suffix) report(arg, suffix);
    },
  }).visit(program);
}
