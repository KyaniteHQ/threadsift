import { catalogKey } from "../../src/core/catalog.ts";

const SURROGATES_FIRST = 0xd800;
const SURROGATES_LAST = 0xdfff;
const LAST_CODE_POINT = 0x10_ffff;

const MATTERS = [
  "i",
  "I",
  "\u0130",
  "\u0131",
  "\u0307",
  "\u0301",
  "\u0323",
  "\u00DF",
  "\u1E9E",
  "\u03A3",
  "\u03C3",
  "\u03C2",
  "\u01F0",
  "\u0390",
  "\u017F",
  "\uFB01",
  "\u2126",
  "\u1E9B",
  "\u0345",
  "\u1F88",
  "\u0149",
  "\u1E9A",
  " ",
  "\u00A0",
];

function previousRuleKey(name: string): string {
  return name.normalize("NFKC").toLowerCase().trim().replaceAll(/\s+/gu, " ");
}

function* samples(): Generator<string> {
  for (let codePoint = 0; codePoint <= LAST_CODE_POINT; codePoint += 1) {
    if (codePoint < SURROGATES_FIRST || codePoint > SURROGATES_LAST) {
      yield String.fromCodePoint(codePoint);
    }
  }

  for (const first of MATTERS) {
    for (const second of MATTERS) {
      yield first + second;

      for (const third of MATTERS) {
        yield first + second + third;
      }
    }
  }
}

const failures: string[] = [];
let checked = 0;

for (const name of samples()) {
  const key = catalogKey(name);
  checked += 1;

  if (catalogKey(key) !== key) {
    failures.push(`${JSON.stringify(name)}: key ${JSON.stringify(key)} is not stable`);
  }

  if (catalogKey(previousRuleKey(name)) !== key) {
    failures.push(`${JSON.stringify(name)}: the previous rule's key gives another key`);
  }
}

process.stdout.write(`${checked} names checked, ${failures.length} failures\n`);

if (failures.length > 0) {
  process.stdout.write(`${failures.slice(0, 20).join("\n")}\n`);
  process.exitCode = 1;
}
