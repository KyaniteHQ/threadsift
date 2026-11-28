import { type BrowserContext, chromium } from "@playwright/test";

import { RUN_AT } from "./clock.ts";

export const SCALE = 2;

export interface View {
  readonly width: number;
  readonly height: number;
  readonly scale: number;
}

export interface Rig {
  readonly scratch: string;
  readonly newContext: (view: Readonly<View>) => Promise<BrowserContext>;
}

export interface LaunchedRig {
  readonly rig: Rig;
  readonly close: () => Promise<void>;
}

export async function launchRig(scratch: string): Promise<LaunchedRig> {
  const browser = await chromium.launch();

  return {
    rig: {
      scratch,
      newContext: async ({ width, height, scale }) => {
        const context = await browser.newContext({
          viewport: { width, height },
          deviceScaleFactor: scale,
          timezoneId: "UTC",
          locale: "en-US",
        });

        await context.clock.setFixedTime(RUN_AT);

        return context;
      },
    },
    close: () => browser.close(),
  };
}
