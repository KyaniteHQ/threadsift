import { readFileSync } from "node:fs";

import { SETTINGS } from "../design/system/settings-table.ts";
import { FACES, FONT_FACES, STYLE_FACES, type FaceId } from "../design/system/style-faces.ts";

const STACKS = ["--f-display", "--f-ui", "--f-read", "--f-mono"] as const;

const NOT_WEB_FONTS = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-serif",
  "ui-sans-serif",
  "ui-monospace",
  "ui-rounded",
  "math",
  "emoji",
  "fangsong",
  "georgia",
  "arial",
  "helvetica",
  "times new roman",
  "courier new",
  "menlo",
  "consolas",
]);

const WEB_FONT_FAMILIES: ReadonlySet<string> = new Set(
  Object.values(FACES).map((face) => face.family),
);

interface Segment {
  readonly head: string;
  readonly body: string | undefined;
}

interface Rule {
  readonly selectors: readonly string[];
  readonly stacks: Readonly<Record<string, readonly string[]>>;
}

interface Choice {
  readonly label: string;
  readonly faces: readonly FaceId[];
  readonly stacks: Readonly<Record<string, readonly string[]>>;
  readonly setsFonts: boolean;
}

function segments(css: string): Segment[] {
  const found: Segment[] = [];
  let depth = 0;
  let start = 0;
  let head = "";
  let quote = "";

  for (let at = 0; at < css.length; at++) {
    const char = css.charAt(at);

    if (quote !== "") {
      if (char === quote) quote = "";
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (char === "{") {
      if (depth === 0) {
        head = css.slice(start, at).trim();
        start = at + 1;
      }

      depth++;
    } else if (char === "}") {
      depth--;

      if (depth === 0) {
        found.push({ head, body: css.slice(start, at) });
        start = at + 1;
      }
    } else if (char === ";" && depth === 0) {
      found.push({ head: css.slice(start, at).trim(), body: undefined });
      start = at + 1;
    }
  }

  return found;
}

function familiesOf(value: string): string[] {
  return value.split(",").map((family) => family.trim().replace(/^(['"])(.*)\1$/u, "$2"));
}

function stacksOf(body: string) {
  return Object.fromEntries(
    segments(body).flatMap(({ head, body: nested }) => {
      const colon = head.indexOf(":");
      const name = head.slice(0, colon).trim();

      return nested === undefined && colon > 0 && STACKS.some((stack) => stack === name)
        ? [[name, familiesOf(head.slice(colon + 1))] as const]
        : [];
    }),
  );
}

function rulesOf(css: string): Rule[] {
  const withoutComments = css.replaceAll(/\/\*[\s\S]*?\*\//gu, "");

  return segments(withoutComments).flatMap(({ head, body }) =>
    body === undefined
      ? []
      : [{ selectors: head.split(",").map((selector) => selector.trim()), stacks: stacksOf(body) }],
  );
}

function settingRow(key: "style" | "font") {
  const row = SETTINGS.find((candidate) => candidate.key === key);

  if (row === undefined) throw new Error(`settings-table.ts has no ${key} row`);

  return row;
}

function choicesOf(
  rules: readonly Rule[],
  key: "style" | "font",
  rows: Readonly<Record<string, readonly FaceId[]>>,
): Choice[] {
  const { attribute, label, default: fallback } = settingRow(key);
  const everyValue = rules.filter((rule) => rule.selectors.includes(`[${attribute}]`));

  return Object.entries(rows).map(([id, faces]) => {
    const own = rules.filter((rule) => rule.selectors.includes(`[${attribute}="${id}"]`));

    return {
      label: `${label} ${id}`,
      faces,
      stacks: Object.fromEntries(
        [...everyValue, ...own].flatMap((rule) => Object.entries(rule.stacks)),
      ),
      setsFonts: !(key === "style" && id === fallback),
    };
  });
}

function missingStacks(choice: Choice): string[] {
  return STACKS.flatMap((stack) =>
    !choice.setsFonts || stack in choice.stacks ? [] : [`${choice.label}: no block sets ${stack}`],
  );
}

function wrongFirstFamilies(choice: Choice): string[] {
  const provided = new Set(choice.faces.map((face) => FACES[face].family));

  return Object.entries(choice.stacks).flatMap(([stack, families]) => {
    const first = families[0] ?? "";

    if (provided.has(first) || NOT_WEB_FONTS.has(first.toLowerCase())) return [];

    return WEB_FONT_FAMILIES.has(first)
      ? [`${choice.label}: ${stack} starts with "${first}", which none of its faces provide`]
      : [
          `${choice.label}: ${stack} starts with "${first}", which no face declares and is not a generic or system family`,
        ];
  });
}

function unusedFaces(choice: Choice): string[] {
  const used = new Set(Object.values(choice.stacks).flat());

  return choice.faces.flatMap((face) =>
    used.has(FACES[face].family)
      ? []
      : [`${choice.label}: face "${face}" ("${FACES[face].family}") is in none of its stacks`],
  );
}

const rules = rulesOf(
  readFileSync(new URL("../design/system/tokens.css", import.meta.url), "utf8"),
);

const choices = [
  ...choicesOf(rules, "style", STYLE_FACES),
  ...choicesOf(rules, "font", FONT_FACES),
];

const problems = choices.flatMap((choice) => [
  ...missingStacks(choice),
  ...wrongFirstFamilies(choice),
  ...unusedFaces(choice),
]);

if (problems.length > 0) {
  process.stderr.write(`${problems.join("\n")}\n`);
  process.exit(1);
}

process.stdout.write(
  `Font faces: ${choices.length} Styles and Fonts match the stacks in tokens.css\n`,
);
