/* oxlint-disable unicorn/consistent-function-scoping -- addInitScript serialises this one function, so its helpers must sit inside it */
import type { Page } from "@playwright/test";
import { z } from "zod";

const LayoutShiftSchema = z.object({
  value: z.number(),
  hadRecentInput: z.boolean(),
  inBar: z.boolean(),
});

const SnapshotSchema = z.object({
  shifts: z.string().transform((json) => z.array(LayoutShiftSchema).parse(JSON.parse(json))),
  headings: z
    .string()
    .transform((json) => z.record(z.string(), z.array(z.number())).parse(JSON.parse(json))),
  bar: z
    .string()
    .transform((json) => z.record(z.string(), z.array(z.string())).parse(JSON.parse(json))),
});

declare global {
  interface Window {
    layoutShifts(): string;
    headingPositions(): string;
    barPositions(): string;
    restartLayout(): void;
    clearHeadingPositions(): void;
    clearBarPositions(): void;
  }
}

export interface LayoutSnapshot {
  readonly shift: number;
  readonly barShift: number;
  readonly barShifts: number;
  readonly headings: Readonly<Record<string, readonly number[]>>;
  readonly bar: Readonly<Record<string, readonly string[]>>;
}

export interface LayoutWatch {
  snapshot(): Promise<LayoutSnapshot>;
  restart(): Promise<void>;
}

async function observeShifts(page: Page): Promise<void> {
  await page.addInitScript(() => {
    interface Shift extends PerformanceEntry {
      readonly value: number;
      readonly hadRecentInput: boolean;
      readonly sources: readonly { readonly node: Node | null }[];
    }

    const isShift = (entry: PerformanceEntry): entry is Shift =>
      "value" in entry && "hadRecentInput" in entry && "sources" in entry;

    const inBar = (node: Node | null): boolean => {
      const element = node instanceof Element ? node : (node?.parentElement ?? null);

      return element?.closest(".rd-bar") !== null && element !== null;
    };

    const entries: { value: number; hadRecentInput: boolean; inBar: boolean }[] = [];

    const keep = (list: readonly PerformanceEntry[]): void => {
      for (const entry of list.filter((candidate) => isShift(candidate)))
        entries.push({
          value: entry.value,
          hadRecentInput: entry.hadRecentInput,
          inBar: entry.sources.some(({ node }) => inBar(node)),
        });
    };

    const observer = new PerformanceObserver((list) => {
      keep(list.getEntries());
    });

    observer.observe({ type: "layout-shift", buffered: true });

    window.layoutShifts = () => {
      keep(observer.takeRecords());

      return JSON.stringify(entries);
    };

    window.restartLayout = () => {
      keep(observer.takeRecords());
      entries.length = 0;
    };
  });
}

async function sampleHeadings(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const tops = new Map<string, number[]>();

    const sample = (): void => {
      for (const heading of document.querySelectorAll("main h2")) {
        const text = heading.textContent;
        const top = Math.round((window.scrollY + heading.getBoundingClientRect().top) * 100) / 100;
        const seen = tops.get(text) ?? [];

        if (!seen.includes(top)) tops.set(text, [...seen, top]);
      }

      requestAnimationFrame(sample);
    };

    requestAnimationFrame(sample);
    window.headingPositions = () => JSON.stringify(Object.fromEntries(tops));

    window.clearHeadingPositions = () => {
      tops.clear();
    };
  });
}

async function sampleBar(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const seen = new Map<string, string[]>();

    const sample = (): void => {
      const counts = new Map<string, number>();

      for (const part of document.querySelectorAll(
        ".rd-bar, .rd-bar .rd-back, .rd-bar .rd-hint, .rd-bar .rd-cm, .rd-bar .st-gear, .rd-bar .rd-act",
      )) {
        const { top, left, width, height } = part.getBoundingClientRect();

        if (width > 0) {
          const marker =
            [...part.classList].find((name) => name.startsWith("rd-") || name === "st-gear") ?? "";

          const nth = counts.get(marker) ?? 0;
          const round = (value: number): number => Math.round(value * 100) / 100;

          counts.set(marker, nth + 1);

          for (const [axis, value] of [
            ["y", `${round(top)}/${round(height)}`],
            ["x", `${round(left)}/${round(width)}`],
          ] as const) {
            const key = `${marker}#${nth}:${axis}`;
            const known = seen.get(key) ?? [];

            if (!known.includes(value)) seen.set(key, [...known, value]);
          }
        }
      }

      requestAnimationFrame(sample);
    };

    requestAnimationFrame(sample);
    window.barPositions = () => JSON.stringify(Object.fromEntries(seen));

    window.clearBarPositions = () => {
      seen.clear();
    };
  });
}

export async function watchLayout(page: Page): Promise<LayoutWatch> {
  await observeShifts(page);
  await sampleHeadings(page);
  await sampleBar(page);

  return {
    restart: async () => {
      await page.evaluate(() => {
        window.restartLayout();
        window.clearHeadingPositions();
        window.clearBarPositions();
      });
    },
    snapshot: async () => {
      const { shifts, headings, bar } = SnapshotSchema.parse(
        await page.evaluate(() => ({
          shifts: window.layoutShifts(),
          headings: window.headingPositions(),
          bar: window.barPositions(),
        })),
      );

      const unprompted = shifts.filter((entry) => !entry.hadRecentInput);

      const total = (list: readonly { readonly value: number }[]): number =>
        list.reduce((sum, entry) => sum + entry.value, 0);

      return {
        shift: total(unprompted),
        barShift: total(unprompted.filter((entry) => entry.inBar)),
        barShifts: unprompted.filter((entry) => entry.inBar).length,
        headings,
        bar,
      };
    },
  };
}
