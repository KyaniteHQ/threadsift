import { readRepository, readText } from "./doc-lines.ts";
import {
  OPEN_FOLDERS,
  isBrowserSide,
  isMisplaced,
  isTestSide,
  layout,
  placeOf,
  resolveSpecifier,
} from "./oxlint/threadsift/shared/core-layout.ts";
import type { Place } from "./oxlint/threadsift/shared/core-layout.ts";
import { importedSpecifiersOf } from "./oxlint/threadsift/shared/value-imports.ts";

const CODE_FILE = /\.[cm]?[jt]sx?$/u;

const repository = readRepository();
const failures: string[] = [];
const features = layout.order.filter((folder) => !OPEN_FOLDERS.includes(folder));
const outsideSrc = new Map<string, Set<string>>();
const outsideTests = new Map<string, Set<string>>();
const featuresReading = new Map<string, Set<string>>();
const othersReading = new Set<string>();

for (const feature of features) {
  outsideSrc.set(feature, new Set());
  outsideTests.set(feature, new Set());
}

const places = new Map<string, Place>();

for (const path of repository.files) {
  const place = placeOf(path);

  if (place !== null) places.set(path, place);
}

function pathsOfSide(sideKinds: readonly Place["kind"][]): Map<string, string[]> {
  const byName = new Map<string, string[]>();

  for (const [path, place] of places) {
    if (sideKinds.includes(place.kind)) {
      byName.set(place.name, [...(byName.get(place.name) ?? []), path]);
    }
  }

  return byName;
}

function checkPlaces(): void {
  for (const path of repository.files) {
    if (isMisplaced(path)) {
      failures.push(
        `${path} sits where the layout has no place for it; move it into src/core/contract, src/core/kernel, src/core/compose, directly into src/http, or into the core or http folder of a feature that order in tools/core-layout.json lists, under src/features`,
      );
    }
  }

  const withCore = new Set<string | null>();

  for (const { kind, feature } of places.values()) {
    if (kind === "featureCore") withCore.add(feature);
  }

  for (const feature of features) {
    if (!withCore.has(feature)) {
      failures.push(`order lists ${feature}, and src/features/${feature}/core holds no module`);
    }
  }

  for (const [side, kinds] of [
    ["core", ["base", "featureCore"]],
    ["http", ["sharedHttp", "routeList", "featureHttp"]],
  ] as const) {
    for (const [name, paths] of pathsOfSide(kinds)) {
      if (paths.length > 1) {
        failures.push(
          `${name} is on the ${side} side more than once (${paths.join(", ")}); a basename is unique within each side`,
        );
      }
    }
  }
}

function noteImport(importer: string, to: Place): void {
  const from = placeOf(importer);

  if (to.kind === "featureCore" && from?.feature !== to.feature) {
    (isTestSide(importer) ? outsideTests : outsideSrc).get(to.feature ?? "")?.add(to.name);
  }

  if (to.kind === "sharedHttp") {
    const path = `src/http/${to.name}`;

    if (from?.kind === "featureHttp") {
      featuresReading.set(
        path,
        new Set([...(featuresReading.get(path) ?? []), from.feature ?? ""]),
      );
    } else {
      othersReading.add(path);
    }
  }
}

function readImports(): void {
  for (const importer of repository.files) {
    if (!CODE_FILE.test(importer) || isBrowserSide(importer)) continue;

    for (const specifier of importedSpecifiersOf(readText(importer))) {
      const target = resolveSpecifier(importer, specifier);
      const to = target === null ? null : placeOf(target);

      if (to !== null) noteImport(importer, to);
    }
  }
}

function checkList(
  list: "entries" | "testEntries",
  used: Readonly<ReadonlyMap<string, Readonly<ReadonlySet<string>>>>,
): void {
  const who = list === "entries" ? "code under src/" : "test/, tools/ or smoke/";

  for (const [feature, names] of Object.entries(layout[list])) {
    for (const name of names) {
      if (!repository.files.has(`src/features/${feature}/core/${name}`)) {
        failures.push(
          `${list} of ${feature} names ${name}, and src/features/${feature}/core/${name} does not exist`,
        );
      } else if (list === "testEntries" && layout.entries[feature]?.includes(name) === true) {
        failures.push(`${name} is in entries and in testEntries of ${feature}; keep it in entries`);
      } else if (used.get(feature)?.has(name) !== true) {
        failures.push(
          `${list} of ${feature} names ${name}, and no file of ${who} outside src/features/${feature}/ imports it`,
        );
      }
    }
  }
}

function checkSharedHttp(): void {
  for (const [path, owners] of featuresReading) {
    const [owner = ""] = owners;

    if (owners.size === 1 && !othersReading.has(path)) {
      failures.push(
        `${path} is imported only by the http half of ${owner}; move it to src/features/${owner}/http`,
      );
    }
  }
}

checkPlaces();
readImports();
checkList("entries", outsideSrc);
checkList("testEntries", outsideTests);
checkSharedHttp();

if (failures.length > 0) {
  process.stderr.write(
    `${failures.join("\n")}\n${failures.length} layout problems (tools/core-layout.json, docs/architecture/repository-layout.md)\n`,
  );
  process.exit(1);
}
