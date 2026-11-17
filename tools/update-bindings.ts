import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";

import {
  getNodeValue,
  applyEdits,
  modify,
  visit,
  parseTree,
  findNodeAtLocation,
  type JSONPath,
  type ParseError,
} from "jsonc-parser";
import { z } from "zod";

const [copyPath, releasePath, bodyPath] = z
  .tuple([z.string(), z.string(), z.string()])
  .parse(process.argv.slice(2));

function readConfig(filename: string) {
  const text = readFileSync(filename, "utf8");
  const errors: ParseError[] = [];
  const tree = parseTree(text, errors, { allowTrailingComma: true });
  if (errors.length > 0 || tree?.type !== "object")
    throw new Error(`Invalid Wrangler configuration in ${filename}`);
  const root = tree;
  function stringAt(location: readonly (string | number)[]) {
    const node = findNodeAtLocation(root, [...location]);
    return node === undefined ? undefined : z.string().parse(node.value);
  }
  const entries = new Map<string, { path: JSONPath; name: string; scope: JSONPath }>();
  visit(
    text,
    {
      onObjectProperty(key, _offset, _length, _line, _column, getPath) {
        if (key !== "binding") return;
        const path = getPath();
        const scope = path[0] === "env" ? path.slice(0, 2) : [];
        const group = path[scope.length];
        if (group === "vars" || group === "define") return;
        const name = stringAt([...path, key]);
        if (name === undefined) throw new Error("Wrangler binding has no name");
        entries.set(JSON.stringify([...scope, group, name]), { path, name, scope });
      },
    },
    { allowTrailingComma: true },
  );
  return { text, tree, stringAt, entries };
}

const copy = readConfig(copyPath);
const release = readConfig(releasePath);
let text = release.text;

function preserve(path: readonly (string | number)[], value: string | undefined) {
  if (value !== undefined && value !== release.stringAt(path)) {
    text = applyEdits(text, modify(text, [...path], value, {}));
  }
}

const added: string[] = [];
preserve(["name"], copy.stringAt(["name"]));
for (const [key, binding] of release.entries) {
  const { path, name, scope } = binding;
  const match = copy.entries.get(key);
  if (match === undefined) {
    added.push([...scope, name].join("."));
    continue;
  }
  const before = text;
  for (const field of ["id", "database_id", "database_name", "bucket_name", "queue"]) {
    preserve([...path, field], copy.stringAt([...match.path, field]));
  }
  if (text !== before) {
    const updatedTree = parseTree(text, [], { allowTrailingComma: true });
    const updated = updatedTree && findNodeAtLocation(updatedTree, path);
    const original = findNodeAtLocation(copy.tree, match.path);
    if (updated && original && isDeepStrictEqual(getNodeValue(updated), getNodeValue(original))) {
      text = applyEdits(text, [
        {
          offset: updated.offset,
          length: updated.length,
          content: copy.text.slice(original.offset, original.offset + original.length),
        },
      ]);
    }
  }
  if (path[scope.length] !== "queues") continue;
  const consumers = [...scope, "queues", "consumers"];
  const queue = release.stringAt([...path, "queue"]);
  for (const [i] of (findNodeAtLocation(release.tree, consumers)?.children ?? []).entries()) {
    const target = [...consumers, i, "queue"];
    if (release.stringAt(target) === queue)
      preserve(target, copy.stringAt([...match.path, "queue"]));
  }
}
writeFileSync(releasePath, text);
if (added.length > 0) {
  appendFileSync(
    bodyPath,
    "\nProvision these new bindings before merging:\n\n" +
      added.map((name) => `- \`${name}\`\n`).join(""),
  );
}
