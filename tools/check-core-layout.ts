import { posix } from "node:path";

import { readRepository, readText } from "./doc-lines.ts";
import {
  OPEN_FOLDERS,
  isPlaced,
  isTestSide,
  layout,
  placeOf,
  resolveSpecifier,
} from "./oxlint/threadsift/shared/core-layout.ts";
import { importedSpecifiersOf } from "./oxlint/threadsift/shared/value-imports.ts";

const CODE_FILE = /\.[cm]?[jt]sx?$/u;
const BROWSER_ROOTS = ["web/", "extension/", "design/"];

const repository = readRepository();
const failures: string[] = [];
const outsideSrc = new Map<string, Set<string>>();
const outsideTests = new Map<string, Set<string>>();

for (const folder of Object.keys(layout.entries)) {
  outsideSrc.set(folder, new Set());
  outsideTests.set(folder, new Set());
}

for (const path of repository.files) {
  const place = placeOf(path);

  if (place !== null && !isPlaced(place)) {
    failures.push(
      `${path} is not listed under ${place.folder} in modules of tools/core-layout.json`,
    );
  }
}

for (const [name, folder] of Object.entries(layout.modules)) {
  if (!repository.files.has(posix.join("src/core", folder, name))) {
    failures.push(
      `modules lists ${name} under ${folder}, and src/core/${folder}/${name} does not exist`,
    );
  }
}

for (const importer of repository.files) {
  if (!CODE_FILE.test(importer) || BROWSER_ROOTS.some((root) => importer.startsWith(root)))
    continue;

  const from = placeOf(importer)?.folder;

  for (const specifier of importedSpecifiersOf(readText(importer))) {
    const target = resolveSpecifier(importer, specifier);
    const to = target === null ? null : placeOf(target);

    if (to === null || to.folder === from || OPEN_FOLDERS.includes(to.folder)) continue;

    (isTestSide(importer) ? outsideTests : outsideSrc).get(to.folder)?.add(to.name);
  }
}

function checkList(
  list: "entries" | "testEntries",
  used: Readonly<ReadonlyMap<string, Readonly<ReadonlySet<string>>>>,
): void {
  const who = list === "entries" ? "code under src/" : "test/, tools/ or smoke/";

  for (const [folder, names] of Object.entries(layout[list])) {
    for (const name of names) {
      if (layout.modules[name] !== folder) {
        failures.push(
          `${list} of ${folder} names ${name}, which modules does not list under ${folder}`,
        );
      } else if (list === "testEntries" && layout.entries[folder]?.includes(name) === true) {
        failures.push(`${name} is in entries and in testEntries of ${folder}; keep it in entries`);
      } else if (used.get(folder)?.has(name) !== true) {
        failures.push(
          `${list} of ${folder} names ${name}, and no file of ${who} outside ${folder} imports it`,
        );
      }
    }
  }
}

checkList("entries", outsideSrc);
checkList("testEntries", outsideTests);

if (failures.length > 0) {
  process.stderr.write(
    `${failures.join("\n")}\n${failures.length} stale entries in tools/core-layout.json\n`,
  );
  process.exit(1);
}
