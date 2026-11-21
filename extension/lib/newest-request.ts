type IsNewest = () => boolean;

export function newestRequest(): () => IsNewest {
  let latest = 0;

  return () => {
    latest += 1;

    const mine = latest;

    return () => mine === latest;
  };
}

interface Deferral {
  readonly defer: () => void;
  readonly take: () => boolean;
}

export function deferWhileWorking(): Deferral {
  let pending = false;

  return {
    defer() {
      pending = true;
    },
    take() {
      const was = pending;
      pending = false;

      return was;
    },
  };
}
