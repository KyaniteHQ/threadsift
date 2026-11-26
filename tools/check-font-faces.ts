import { existsSync, readFileSync } from "node:fs";

import { SETTINGS } from "../design/system/settings-table.ts";
import { FACES, FONT_FACES, STYLE_FACES, type FaceId } from "../design/system/style-faces.ts";
import { type Rule, rulesOf } from "./check-font-faces-css.ts";

const STACKS = ["--f-display", "--f-ui", "--f-read", "--f-mono"] as const;

const STACK_DECLARATION = new RegExp(`(?:${STACKS.join("|")})\\s*:`, "gu");
const BRAND_STACK = "--f-brand";
const BRAND_DECLARATION = /--f-brand\s*:/gu;
const STYLESHEET = /["'](@fontsource(?:-variable)?\/([^/"']+)\/[^"']+\.css)["']/gu;
const FONT_FAMILY = /font-family:\s*(['"]?)([^;'"]+)\1\s*;/gu;

interface Choice {
  readonly label: string;
  readonly faces: readonly FaceId[];
  readonly stacks: Readonly<Record<string, readonly string[]>>;
  readonly setsFonts: boolean;
}

function readSource(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function settingRow(key: "style" | "font") {
  const row = SETTINGS.find((candidate) => candidate.key === key);

  if (row === undefined) throw new Error(`settings-table.ts has no ${key} row`);

  return row;
}

function selectorsOf(key: "style" | "font", id: string): readonly string[] {
  const { attribute, default: fallback } = settingRow(key);

  if (key === "font") return [`[${attribute}]`, `[${attribute}="${id}"]`];

  return id === fallback ? [] : [`[${attribute}="${id}"]`];
}

function everySelector(): ReadonlySet<string> {
  const ids = { style: Object.keys(STYLE_FACES), font: Object.keys(FONT_FACES) };

  return new Set([
    ":root",
    ...ids.style.flatMap((id) => selectorsOf("style", id)),
    ...ids.font.flatMap((id) => selectorsOf("font", id)),
  ]);
}

function choicesOf(
  rules: readonly Rule[],
  key: "style" | "font",
  rows: Readonly<Record<string, readonly FaceId[]>>,
): Choice[] {
  const { label, default: fallback } = settingRow(key);

  return Object.entries(rows).map(([id, faces]) => {
    const selectors = selectorsOf(key, id);

    return {
      label: `${label} ${id}`,
      faces,
      stacks: Object.fromEntries(
        rules
          .filter((rule) => rule.selectors.some((selector) => selectors.includes(selector)))
          .flatMap((rule) => rule.stacks),
      ),
      setsFonts: !(key === "style" && id === fallback),
    };
  });
}

function unmodeledStacks(css: string, rules: readonly Rule[]): string[] {
  const known = everySelector();

  const modeled = rules
    .filter((rule) => rule.selectors.every((selector) => known.has(selector)))
    .reduce((count, rule) => count + rule.stacks.length, 0);

  const found = css.match(STACK_DECLARATION)?.length ?? 0;

  return found === modeled
    ? []
    : [
        `tokens.css: ${found - modeled} of ${found} font stack declarations sit outside a top-level rule of :root, [data-font], [data-font="id"] or [data-style="id"] of a Style other than Library, which the check does not model`,
      ];
}

function styleBeforeFont(rules: readonly Rule[]): string[] {
  const { attribute } = settingRow("style");

  const styled = (rule: Rule) =>
    rule.stacks.length > 0 &&
    rule.selectors.some((selector) => selector.startsWith(`[${attribute}`));

  const firstStyle = rules.findIndex((rule) => styled(rule));
  const lastFont = rules.findLastIndex((rule) => rule.stacks.length > 0 && !styled(rule));

  return firstStyle !== -1 && lastFont > firstStyle
    ? [
        `tokens.css: a rule that sets Font stacks comes after the first Style rule, so it would override the Style's fonts`,
      ]
    : [];
}

function stylesheetsOf(face: string, text: string): string[] {
  return [...text.matchAll(STYLESHEET)].flatMap((match) =>
    match[2] === face ? [match[1] ?? ""] : [],
  );
}

interface FaceReport {
  readonly families: readonly string[];
  readonly problems: readonly string[];
}

function familiesIn(sheet: string): string[] | undefined {
  const path = `../node_modules/${sheet}`;

  return existsSync(new URL(path, import.meta.url))
    ? [...readSource(path).matchAll(FONT_FAMILY)].map((match) => match[2] ?? "")
    : undefined;
}

function declaredFamilies(face: string, load: string, entryImports: string): FaceReport {
  const sheets = [...stylesheetsOf(face, load), ...stylesheetsOf(face, entryImports)];
  const found = sheets.map((sheet) => ({ sheet, families: familiesIn(sheet) }));
  const families = new Set(found.flatMap((entry) => entry.families ?? []));

  const problems = [
    ...[...load.matchAll(STYLESHEET)].flatMap((match) =>
      match[2] === face
        ? []
        : [`Face ${face}: imports ${match[1] ?? ""}, another package's stylesheet`],
    ),
    ...found.flatMap((entry) =>
      entry.families === undefined ? [`Face ${face}: node_modules has no ${entry.sheet}`] : [],
    ),
    ...(sheets.length === 0 ? [`Face ${face}: no Fontsource stylesheet is imported`] : []),
    ...(families.size > 1
      ? [`Face ${face}: its stylesheets declare ${[...families].join(", ")}`]
      : []),
  ];

  return { families: [...families], problems };
}

function missingStacks(choice: Choice): string[] {
  return STACKS.flatMap((stack) =>
    !choice.setsFonts || stack in choice.stacks ? [] : [`${choice.label}: no block sets ${stack}`],
  );
}

function wrongFirstFamilies(
  choice: Choice,
  declared: Readonly<Record<string, readonly string[]>>,
): string[] {
  const provided = new Set(choice.faces.flatMap((face) => declared[face] ?? []));
  const everyFamily = new Set(Object.values(declared).flat());

  return Object.entries(choice.stacks).flatMap(([stack, families]) => {
    const first = families[0] ?? "";

    if (provided.has(first)) return [];

    return everyFamily.has(first)
      ? [`${choice.label}: ${stack} starts with "${first}", which none of its faces provide`]
      : [`${choice.label}: ${stack} starts with "${first}", which no face declares`];
  });
}

function unusedFaces(
  choice: Choice,
  declared: Readonly<Record<string, readonly string[]>>,
): string[] {
  const used = new Set(Object.values(choice.stacks).flat());

  return choice.faces.flatMap((face) =>
    (declared[face] ?? []).some((family) => used.has(family))
      ? []
      : [`${choice.label}: face "${face}" is in none of its stacks`],
  );
}

function brandProblems(tokens: string, entry: string): string[] {
  const found = tokens.match(BRAND_DECLARATION)?.length ?? 0;
  const onRoot = rulesOf(tokens, [BRAND_STACK]).flatMap((rule) =>
    rule.selectors.join(",") === ":root" ? rule.stacks : [],
  );
  const [first = ""] = onRoot[0]?.[1] ?? [];
  const loaded = [...entry.matchAll(STYLESHEET)].flatMap((hit) => familiesIn(hit[1] ?? "") ?? []);

  if (found !== 1 || onRoot.length !== 1) {
    return [
      `tokens.css: ${String(found)} ${BRAND_STACK} declarations, ${String(onRoot.length)} in a top-level :root rule; the wordmark needs exactly one, on :root, so no Font or Style changes it`,
    ];
  }

  return loaded.includes(first)
    ? []
    : [`tokens.css: main.tsx loads no "${first}" for ${BRAND_STACK}`];
}

const css = readSource("../design/system/tokens.css").replaceAll(/\/\*[\s\S]*?\*\//gu, "");
const entryImports = readSource("../web/src/main.tsx");
const rules = rulesOf(css, STACKS);

const choices = [
  ...choicesOf(rules, "style", STYLE_FACES),
  ...choicesOf(rules, "font", FONT_FACES),
];

const faces = Object.entries(FACES).map(
  ([face, load]) => [face, declaredFamilies(face, String(load), entryImports)] as const,
);

const declared = Object.fromEntries(faces.map(([face, { families }]) => [face, families]));

const problems = [
  ...faces.flatMap(([, { problems: found }]) => found),
  ...unmodeledStacks(css, rules),
  ...styleBeforeFont(rules),
  ...brandProblems(css, entryImports),
  ...choices.flatMap((choice) => [
    ...missingStacks(choice),
    ...wrongFirstFamilies(choice, declared),
    ...unusedFaces(choice, declared),
  ]),
];

if (problems.length > 0) {
  process.stderr.write(`${problems.join("\n")}\n`);
  process.exit(1);
}

process.stdout.write(
  `Font faces: ${choices.length} Styles and Fonts, and the wordmark, match the stacks in tokens.css\n`,
);
