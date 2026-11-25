export function focusUnmoved(): () => boolean {
  const origin = document.activeElement;

  return () => {
    const active = document.activeElement;

    return active === origin || active === null || active === document.body;
  };
}
