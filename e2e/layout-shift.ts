import type { Page } from "@playwright/test";
import { z } from "zod";

const LayoutShiftSchema = z.object({
  startTime: z.number(),
  value: z.number(),
  hadRecentInput: z.boolean(),
});

declare global {
  interface Window {
    recordLayoutShift(entry: string): void;
  }
}

export interface ShiftWatch {
  since(milliseconds: number): number;
}

export async function watchLayoutShift(page: Page): Promise<ShiftWatch> {
  const shifts: z.infer<typeof LayoutShiftSchema>[] = [];

  await page.exposeFunction("recordLayoutShift", (entry: string) => {
    shifts.push(LayoutShiftSchema.parse(JSON.parse(entry)));
  });

  await page.addInitScript(() => {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.recordLayoutShift(JSON.stringify(entry));
    }).observe({ type: "layout-shift", buffered: true });
  });

  return {
    since: (milliseconds) =>
      shifts
        .filter((shift) => shift.startTime >= milliseconds && !shift.hadRecentInput)
        .reduce((sum, shift) => sum + shift.value, 0),
  };
}
