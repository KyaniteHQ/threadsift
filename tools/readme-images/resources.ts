export interface Resources {
  readonly own: <Held>(held: Held, release: (held: Held) => Promise<void>) => Held;
  readonly releaseAll: () => Promise<void>;
}

async function releaseInOrder(releases: ReadonlyArray<() => Promise<void>>): Promise<void> {
  const [next, ...rest] = releases;

  if (next === undefined) return;
  try {
    await next();
  } catch (error) {
    process.stderr.write(`Cleanup failed: ${String(error).slice(0, 300)}\n`);
  }
  await releaseInOrder(rest);
}

export function resources(): Resources {
  const releases: Array<() => Promise<void>> = [];

  return {
    own: (held, release) => {
      releases.push(() => release(held));

      return held;
    },
    releaseAll: () => releaseInOrder(releases.toReversed()),
  };
}
