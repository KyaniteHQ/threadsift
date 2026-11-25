export async function atClock<Result>(
  clock: () => number,
  run: () => Promise<Result>,
): Promise<Result> {
  const real = Date.now;
  Date.now = clock;

  try {
    return await run();
  } finally {
    Date.now = real;
  }
}

export function steppingClock(start: number): () => number {
  let calls = 0;

  return () => start + calls++;
}
