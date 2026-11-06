import type { Page } from "@playwright/test";

interface CardLife {
  readonly titleAt: number | null;
  readonly leftAt: number | null;
  readonly hiddenAt: number | null;
}

type Since = "titleAt" | "leftAt";

interface Seen {
  titleAt: number | null;
  leftAt: number | null;
  hiddenAt: number | null;
}

export async function watchCardLife(page: Page): Promise<() => Promise<CardLife>> {
  const life = await page.evaluateHandle(() => {
    const seen: Seen = { titleAt: null, leftAt: null, hiddenAt: null };

    let text = "";

    new MutationObserver(() => {
      const card = document.querySelector(".paste .ps");
      const now = card?.querySelector(".ps-title")?.textContent ?? "";

      if (card === null && text !== "") {
        text = "";
        seen.hiddenAt = performance.now();
      } else if (card !== null && now !== text) {
        text = now;
        seen.titleAt = performance.now();
        seen.hiddenAt = null;
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true });

    document.addEventListener(
      "pointerout",
      (event) => {
        const from = event.target instanceof Element ? event.target.closest(".paste .ps") : null;

        const to =
          event.relatedTarget instanceof Element ? event.relatedTarget.closest(".paste .ps") : null;

        if (from !== null && to === null) {
          seen.leftAt = performance.now();
        }
      },
      true,
    );

    return seen;
  });

  return () =>
    life.evaluate((seen) => ({
      titleAt: seen.titleAt,
      leftAt: seen.leftAt,
      hiddenAt: seen.hiddenAt,
    }));
}

export async function closeDelayOf(read: () => Promise<CardLife>, since: Since): Promise<number> {
  const life = await read();
  const from = life[since];

  if (from === null || life.hiddenAt === null) {
    throw new Error(`the card did not show and then close (${JSON.stringify(life)})`);
  }

  return life.hiddenAt - from;
}
