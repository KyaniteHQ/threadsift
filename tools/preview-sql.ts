export function quoted(text: string): string {
  return `'${text.replaceAll("'", "''")}'`;
}
