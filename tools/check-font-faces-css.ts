export type Stack = readonly [name: string, families: readonly string[]];

interface Segment {
  readonly head: string;
  readonly body: string | undefined;
}

export interface Rule {
  readonly selectors: readonly string[];
  readonly stacks: readonly Stack[];
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

  const last = css.slice(start).trim();

  return last === "" ? found : [...found, { head: last, body: undefined }];
}

function familiesOf(value: string): string[] {
  return value.split(",").map((family) => family.trim().replace(/^(['"])(.*)\1$/u, "$2"));
}

function stacksOf(body: string, names: readonly string[]): Stack[] {
  return segments(body).flatMap(({ head, body: nested }) => {
    const colon = head.indexOf(":");
    const name = head.slice(0, colon).trim();

    return nested === undefined && colon > 0 && names.includes(name)
      ? [[name, familiesOf(head.slice(colon + 1))] as const]
      : [];
  });
}

export function rulesOf(css: string, names: readonly string[]): Rule[] {
  return segments(css).flatMap(({ head, body }) =>
    body === undefined
      ? []
      : [
          {
            selectors: head.split(",").map((selector) => selector.trim()),
            stacks: stacksOf(body, names),
          },
        ],
  );
}
