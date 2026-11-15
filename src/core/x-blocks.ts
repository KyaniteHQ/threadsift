export const LINE_BREAK = /\r\n|[\r\n\u2028\u2029]/u;

const FENCE = /^ {0,3}(`{3,}|~{3,})/u;

interface HtmlBlock {
  readonly start: Readonly<RegExp>;
  readonly end: Readonly<RegExp>;
  readonly closer: (line: string) => string;
}

const HTML_BLOCKS: readonly HtmlBlock[] = [
  {
    start: /^ {0,3}<(?:script|pre|style|textarea)(?:[\s>]|$)/iu,
    end: /<\/(?:script|pre|style|textarea)>/iu,
    closer: (line) => `</${/^ {0,3}<(?<tag>[a-z]+)/iu.exec(line)?.groups?.["tag"] ?? "pre"}>`,
  },
  { start: /^ {0,3}<!--/u, end: /-->/u, closer: () => "-->" },
  { start: /^ {0,3}<\?/u, end: /\?>/u, closer: () => "?>" },
  { start: /^ {0,3}<!\[CDATA\[/u, end: /\]\]>/u, closer: () => "]]>" },
  { start: /^ {0,3}<![A-Z]/iu, end: />/u, closer: () => ">" },
];

type Open =
  | { readonly kind: "none" }
  | { readonly kind: "fence"; readonly fence: string }
  | { readonly kind: "html"; readonly block: HtmlBlock; readonly line: string };

function afterFence(open: Readonly<Open>, fence: string, rest: string): Open {
  if (open.kind === "none") {
    return fence.startsWith("`") && rest.includes("`") ? open : { kind: "fence", fence };
  }

  if (open.kind !== "fence") return open;

  return fence.startsWith(open.fence[0] ?? "") &&
    fence.length >= open.fence.length &&
    rest.trim() === ""
    ? { kind: "none" }
    : open;
}

function afterLine(open: Readonly<Open>, line: string): Open {
  if (open.kind === "html") {
    return open.block.end.test(line) ? { kind: "none" } : open;
  }

  const match = FENCE.exec(line);

  if (match !== null) return afterFence(open, match[1] ?? "", line.slice(match[0].length));

  if (open.kind === "fence") return open;

  const block = HTML_BLOCKS.find(({ start }) => start.test(line));

  return block === undefined || block.end.test(line.replace(block.start, ""))
    ? open
    : { kind: "html", block, line };
}

export function closedBlocks(text: string): string {
  let open: Open = { kind: "none" };

  for (const line of text.split(LINE_BREAK)) open = afterLine(open, line);

  switch (open.kind) {
    case "none":
      return text;
    case "fence":
      return `${text}\n${open.fence}`;
    case "html":
      return `${text}\n${open.block.closer(open.line)}`;
    default: {
      const exhaustive: never = open;

      throw new Error(exhaustive);
    }
  }
}
