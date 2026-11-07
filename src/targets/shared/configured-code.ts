export function configuredCode(value: string | undefined): string | undefined {
  return value === "" ? undefined : value;
}
