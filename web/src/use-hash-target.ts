import { useEffect } from "react";

const PAGE_TITLE = ".pg-title";

export function useHashTarget(ready: boolean): void {
  useEffect(() => {
    if (!ready) return;

    const id = window.location.hash.slice(1);
    const target = id === "" ? null : document.querySelector(`#${CSS.escape(id)}`);

    if (target === null) return;

    target.scrollIntoView({ block: "start" });

    const active = document.activeElement;

    if (active === null || active === document.body || active.matches(PAGE_TITLE)) {
      target.querySelector("h2")?.focus({ preventScroll: true });
    }
  }, [ready]);
}
