export interface Keyed {
  readonly key: string;
  readonly text: string;
}

export function keyed(texts: readonly string[]): readonly Keyed[] {
  const seen = new Map<string, number>();

  return texts.map((text) => {
    const count = (seen.get(text) ?? 0) + 1;
    seen.set(text, count);

    return { key: `${text}#${count}`, text };
  });
}
