export function configuredSetupCode(value: string | undefined): string | undefined {
  return value === "" ? undefined : value;
}
