import { posix } from "node:path";

import { escapeRegExp, readRepository, readText } from "./doc-lines.ts";

const workflow = ".github/workflows/gate.yml";
const gate = readText(workflow);
const classifier = gate.match(/^ +docs_diff\(\) \{\n([\s\S]*?)^ +\}$/mu)?.[1];
const arm = classifier?.match(
  /^ +case "\$path" in\s+([\w./*?-]+(?:\|[\w./*?-]+)*)\) ;;\s+\*\) return 1 ;;\s+esac$/mu,
)?.[1];
if (arm === undefined)
  throw new Error(`${workflow}: cannot read the docs_diff skip list; check its case arms`);

const patterns = arm.split("|").map((pattern) => {
  const expression = escapeRegExp(pattern).replaceAll("\\*", ".*").replaceAll("\\?", ".");

  return new RegExp(`^${expression}$`, "u");
});
const { files } = readRepository();
const skipped = new Set(
  [...files].filter((file) => patterns.some((pattern) => pattern.test(file))),
);

function report(file: string, line: number, path: string): void {
  process.stderr.write(`${file}:${String(line)}: remove ${path} from the docs-only skip list\n`);
  process.exitCode = 1;
}

const inputs = [
  "{test,smoke,src,web,extension}/**/*.{ts,tsx,js,mjs,cjs,mts,cts,json,sh}",
  "{vite,drizzle,playwright}.config.ts",
  "{devenv.nix,devenv.yaml,wrangler.jsonc,pnpm-workspace.yaml,tsconfig.json,package.json}",
  "tools/{test-shards,shard-reporter,check-worker-size,check-font-faces,deploy-worker,theme-script,worker-headers}.ts",
  "tools/{bot-release,image-digest,start-check}.sh",
];

function checkLine(file: string, number: number, line: string, previous = ""): void {
  for (const token of line.matchAll(/[\w./-]+/gu)) {
    const path = token[0];
    const local = posix.join(posix.dirname(file), path);
    if (skipped.has(local)) {
      report(file, number, local);
      continue;
    }
    const bareRead = /\b(?:readFile(?:Sync)?|open(?:Sync)?|createReadStream)\(\s*["'`]?$/u.test(
      previous + "\n" + line.slice(0, token.index),
    );
    if (
      (path.includes("/") || bareRead || !/\.[cm]?[jt]sx?$/u.test(file)) &&
      skipped.has(posix.normalize(path))
    ) {
      report(file, number, posix.normalize(path));
    }
  }
}

for (const file of files) {
  if (inputs.some((glob) => posix.matchesGlob(file, glob)))
    readText(file)
      .split("\n")
      .forEach((line, i, lines) => {
        checkLine(file, i + 1, line, lines[i - 1]);
      });
}

let skippedJob = false;
gate.split("\n").forEach((line, i) => {
  const job = /^  ([\w-]+):$/u.exec(line)?.[1];
  if (job !== undefined) skippedJob = ["check", "smoke", "deploy", "image"].includes(job);
  if (skippedJob) checkLine(workflow, i + 1, line);
});

const ignore = readText(".dockerignore")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line !== "" && !line.startsWith("#"));

function parents(path: string): string[] {
  const paths = [path];
  for (let dir = posix.dirname(path); dir !== "."; dir = posix.dirname(dir)) paths.push(dir);

  return paths;
}

function ignored(paths: readonly string[]): boolean {
  const rule = ignore.findLast((entry) => {
    const glob = entry.replace(/^!/u, "").replaceAll(/^\/|\/$/gu, "");

    return paths.some((path) => posix.matchesGlob(path, glob));
  });

  return rule !== undefined && !rule.startsWith("!");
}

const imageLines = readText("Containerfile").split("\n");
for (let i = 0; i < imageLines.length; i++) {
  const number = i + 1;
  let line = imageLines[i] ?? "";
  while (line.endsWith("\\") && i + 1 < imageLines.length) {
    i++;
    line = line.slice(0, -1) + (imageLines[i] ?? "");
  }
  const args = /^\s*(?:COPY|ADD)\s+(.+)$/iu.exec(line)?.[1];
  if (args === undefined) {
    checkLine("Containerfile", number, line);
    continue;
  }
  if (/(?:^|\s)--from=/u.test(args)) continue;
  const sources =
    args
      .match(/"[^"]*"|[^\s,[\]"]+/gu)
      ?.filter((word) => !word.startsWith("--"))
      .slice(0, -1) ?? [];
  for (const source of sources) {
    const glob =
      posix.normalize(source.replaceAll('"', "").replace(/^\/+/u, "")).replace(/\/$/u, "") || ".";
    for (const path of skipped) {
      const paths = parents(path);
      if (
        path === glob ||
        (paths.includes(glob) && ignored([glob])) ||
        ((glob === "." || paths.some((part) => posix.matchesGlob(part, glob))) && !ignored(paths))
      ) {
        report("Containerfile", number, path);
        break;
      }
    }
  }
}
