import { posix } from "node:path";

import { readText } from "./doc-lines.ts";

function section(file: string, key: string): string[] {
  const blocks = readText(file)
    .replaceAll(/[ \t]+#.*$|^#.*$/gmu, "")
    .split(/^(?=\S)/mu);
  const block = blocks.find((part) => new RegExp(`^["']?${key}["']?:`, "u").test(part)) ?? "";
  const [header = "", ...children] = block.split("\n");
  const fields = children.filter((line) => line.trim() !== "");
  const indent = fields[0]?.match(/^\s*/u)?.[0].length;
  return [
    header.slice(header.indexOf(":") + 1).trim(),
    ...fields.flatMap((line) =>
      line.length - line.trimStart().length === indent ? [line.trim()] : [],
    ),
  ];
}

function usesTarget(
  caller: string,
  line: number,
  target: string,
  step: boolean,
  files: Readonly<ReadonlySet<string>>,
): string | undefined {
  const location = `${caller}:${String(line)}: uses: ${target}`;
  const remote = step
    ? /^(?:[\w-]+\/[\w.-]+(?:\/[\w./-]+)?@[^\s@]+|docker:\/\/\S+)$/u
    : /^[\w-]+\/[\w.-]+\/\.github\/workflows\/[\w.-]+\.ya?ml@[^\s@]+$/u;
  if (remote.test(target)) return undefined;
  if (!/^[.$]\//u.test(target) || target.split("/").includes(".."))
    throw new Error(
      `${location}: expected a local workflow, composite action or external action reference`,
    );
  const path = target.slice(2).replace(/\/$/u, "");
  if (!step) {
    if (!/^\.github\/workflows\/[\w.-]+\.ya?ml$/u.test(path) || !files.has(path))
      throw new Error(`${location}: expected a local reusable workflow file in .github/workflows`);
    const trigger = section(path, "on");
    if (
      !trigger.some((field) =>
        /(?:^|^-[ \t]+|[[{,][ \t]*)["']?workflow_call["']?(?=[ \t]*(?:[:,}\]]|$))/u.test(field),
      )
    )
      throw new Error(`${location}: the local workflow must declare workflow_call`);
    return path;
  }
  const manifest = ["action.yml", "action.yaml"]
    .map((name) => posix.join(path, name))
    .find((file) => files.has(file));
  if (
    manifest === undefined ||
    !section(manifest, "runs").some((field) => /^using:\s*["']?composite["']?$/u.test(field))
  )
    throw new Error(
      `${location}: expected a local composite action directory with action.yml or action.yaml`,
    );
  return manifest;
}

export function calledWorkflowsAndActions(
  workflow: string,
  files: Readonly<ReadonlySet<string>>,
): Set<string> {
  const workflowInputs = new Set([workflow]);
  for (const caller of workflowInputs) {
    let stepsIndent = -1;
    let blockIndent = -1;
    for (const [i, line] of readText(caller).split("\n").entries()) {
      const content = line.trimStart();
      const indent = line.length - content.length;
      if (content === "" || content.startsWith("#")) continue;
      if (blockIndent >= 0 && indent > blockIndent) continue;
      blockIndent = /:\s*(?:&[\w-]+\s+)?[>|][-+\d]*\s*(?:#.*)?$/u.test(content)
        ? indent + (content.startsWith("- ") ? 2 : 0)
        : -1;
      if (indent < stepsIndent || (indent === stepsIndent && !content.startsWith("- ")))
        stepsIndent = -1;
      if (/^steps:\s*(?:#.*)?$/u.test(content)) stepsIndent = indent;
      const raw = /^(?:-\s+)?(?:uses|"uses"|'uses'):\s*(.*)$/u.exec(content)?.[1];
      if (raw === undefined) {
        if (/[{,]\s*["']?uses["']?\s*:/u.test(content))
          throw new Error(
            `${caller}:${String(i + 1)}: write uses as a YAML block mapping so its target can be checked`,
          );
        continue;
      }
      const target = raw
        .replace(/\s+#.*$/u, "")
        .trim()
        .replace(/^(['"])(.*)\1$/u, "$2");
      const local = usesTarget(caller, i + 1, target, stepsIndent >= 0, files);
      if (local !== undefined) workflowInputs.add(local);
    }
  }

  return workflowInputs;
}
