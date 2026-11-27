export function filled(template: string, values: Readonly<Record<string, string>>): string {
  return template.replaceAll(
    /\{(\w+)\}/gu,
    (placeholder, key: string) => values[key] ?? placeholder,
  );
}
