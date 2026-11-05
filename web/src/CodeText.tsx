import type { ReactNode } from "react";

const CODE_NAMES = /SETUP_CODE|Setup code:/gu;

export function CodeText({ text }: Readonly<{ text: string }>) {
  const parts: ReactNode[] = [];
  let from = 0;

  for (const match of text.matchAll(CODE_NAMES)) {
    parts.push(text.slice(from, match.index), <code key={match.index}>{match[0]}</code>);
    from = match.index + match[0].length;
  }

  parts.push(text.slice(from));

  return parts;
}
