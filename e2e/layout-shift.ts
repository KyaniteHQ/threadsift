/* oxlint-disable unicorn/consistent-function-scoping -- addInitScript serialises this one function, so its helpers must sit inside it */
import type { Page } from "@playwright/test";
import { z } from "zod";

const LayoutShiftSchema = z.object({
  value: z.number(),
  hadRecentInput: z.boolean(),
  barOnly: z.boolean(),
});

const SnapshotSchema = z.object({
  shifts: z.string().transform((json) => z.array(LayoutShiftSchema).parse(JSON.parse(json))),
  headings: z
    .string()
    .transform((json) => z.record(z.string(), z.array(z.number())).parse(JSON.parse(json))),
});

declare global {
  interface Window {
    layoutShifts(): string;
    headingPositions(): string;
  }
}

export interface LayoutSnapshot {
  readonly shift: number;
  readonly headings: Readonly<Record<string, readonly number[]>>;
}

export interface LayoutWatch {
  snapshot(): Promise<LayoutSnapshot>;
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

    const inBar = (node: Node | null): boolean =>
      node !== null &&
      node.parentElement?.closest(".pg-bar") !== null &&
      node.parentElement !== null;

    const entries: { value: number; hadRecentInput: boolean; barOnly: boolean }[] = [];

    const keep = (list: readonly PerformanceEntry[]): void => {
      for (const entry of list.filter((candidate) => isShift(candidate)))
        entries.push({
          value: entry.value,
          hadRecentInput: entry.hadRecentInput,
          barOnly: entry.sources.length > 0 && entry.sources.every(({ node }) => inBar(node)),
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
  });
}

export async function watchLayout(page: Page): Promise<LayoutWatch> {
  await observeShifts(page);
  await sampleHeadings(page);

  return {
    snapshot: async () => {
      const { shifts, headings } = SnapshotSchema.parse(
        await page.evaluate(() => ({
          shifts: window.layoutShifts(),
          headings: window.headingPositions(),
        })),
      );

      return {
        shift: shifts
          .filter((entry) => !entry.hadRecentInput && !entry.barOnly)
          .reduce((sum, entry) => sum + entry.value, 0),
        headings,
      };
    },
  };
}
