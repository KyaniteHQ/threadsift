export interface FocusWatch {
  readonly unmoved: () => boolean;
  readonly stop: () => void;
}

export function watchFocus(): FocusWatch {
  const origin = document.activeElement;
  const watching = new AbortController();
  let moved = false;

  document.addEventListener(
    "focusin",
    ({ target }) => {
      if (target !== origin && target !== document.body) moved = true;
    },
    { signal: watching.signal },
  );

  return {
    unmoved: () => !moved,
    stop: () => {
      watching.abort();
    },
  };
}
