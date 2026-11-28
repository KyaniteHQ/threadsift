import { type Page, expect } from "@playwright/test";
import { z } from "zod";

const MotionsSchema = z.array(
  z.object({ done: z.boolean(), moved: z.array(z.string()), changing: z.number() }),
);

export const MOTION_ITEM = {
  url: "https://example.com/guides/reader-motion",
  page: { markdown: "A page the Reader opens from its card.", title: "Opening from a card" },
  digest: {
    title: "Opening from a card",
    topic: "Reading",
    tags: ["motion"],
    summary: "The card grows into the Reader.\nClosing runs it back.",
    keyPoints: ["One shared name per Item"],
  },
};

export function watchMotion(): void {
  const start = document.startViewTransition.bind(document);
  const runs: { done: boolean; moved: readonly string[]; changing: number }[] = [];
  const write = (): void => {
    document.documentElement.dataset["motion"] = JSON.stringify(runs);
  };

  document.startViewTransition = (update) => {
    const transition = start(update);
    const moved: readonly string[] = [];
    const run = { done: false, moved, changing: 0 };
    runs.push(run);
    write();

    const end = (): void => {
      run.done = true;
      write();
    };
    const measure = (): void => {
      const changing = document.documentElement
        .getAnimations({ subtree: true })
        .map((each) => each.effect)
        .filter((each) => each instanceof KeyframeEffect)
        .filter((each) => (each.pseudoElement ?? "").startsWith("::view-transition"))
        .filter((each) => {
          const frames = each.getKeyframes();

          return ["opacity", "transform", "width", "height"].some(
            (key) => String(frames.at(0)?.[key]) !== String(frames.at(-1)?.[key]),
          );
        });

      run.changing = changing.length;
      run.moved = changing
        .map((each) => /^::view-transition-group\((.+)\)$/u.exec(each.pseudoElement ?? "")?.[1])
        .filter((name): name is string => name !== undefined && name !== "root");
      write();
    };

    transition.ready.then(measure, write);
    transition.finished.then(end, end);

    return transition;
  };
}

const motions = async (page: Page) =>
  MotionsSchema.parse(
    JSON.parse(await page.evaluate(() => document.documentElement.dataset["motion"] ?? "[]")),
  );

export async function motionOf(page: Page, act: () => Promise<void>, readers: number) {
  const since = (await motions(page)).length;

  await act();
  await expect(page.locator(".reader-slot")).toHaveCount(readers);
  await expect
    .poll(
      async () => {
        const runs = (await motions(page)).slice(since);

        return runs.length > 0 && runs.every((run) => run.done);
      },
      { message: "a view transition starts and finishes" },
    )
    .toBe(true);

  return (await motions(page)).slice(since);
}
