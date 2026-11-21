export function filled(template: string, values: Readonly<Record<string, string>>): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, () => value),
    template,
  );
}
