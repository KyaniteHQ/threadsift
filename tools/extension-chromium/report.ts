export interface Result {
  readonly check: string;
  readonly ok: boolean;
  readonly detail: string;
}

const results: Result[] = [];

export function record(check: string, ok: boolean, detail: string): void {
  results.push({ check, ok, detail });
  process.stdout.write(`${ok ? "PASS" : "FAIL"} ${check}\n     ${detail}\n`);
}

export function allResults(): readonly Result[] {
  return results;
}

export function failures(): number {
  return results.filter(({ ok }) => !ok).length;
}
