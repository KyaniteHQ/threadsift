export function median(values: readonly number[]): number {
  return percentile(values, 50);
}

export function percentile(values: readonly number[], rank: number): number {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((rank / 100) * sorted.length))] ?? 0;
}

export function inSequence<T, R>(
  items: readonly T[],
  run: (item: T) => Promise<R>,
): Promise<readonly R[]> {
  return items.reduce<Promise<R[]>>(async (done, item) => {
    const results = await done;
    results.push(await run(item));
    return results;
  }, Promise.resolve([]));
}

export function counted(total: number): readonly number[] {
  return Array.from({ length: total }, (_, index) => index);
}
