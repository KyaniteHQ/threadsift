export function collapsedText(text: string): string {
  return text.replaceAll(/\s+/gu, " ").trim();
}
