export function envValue(name: string): string {
  const value = process.env[name];

  if (value === undefined) {
    throw new Error(`Set ${name}; tools/e2e/container.sh and tools/e2e/worker.sh do`);
  }

  return value;
}
