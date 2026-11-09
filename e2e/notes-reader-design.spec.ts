import { type Page, type TestInfo, test } from "@playwright/test";

import { THEMES, resize } from "./design-screens.ts";
import { openReader, seedThread } from "./highlight-reader.ts";
import { screenForFile, thread } from "./highlight-screen.ts";
import { walkStates } from "./note-design.ts";
import { saved } from "./notes.ts";

const screenOf = screenForFile(900_000);

async function shoot(page: Page, info: TestInfo, name: string): Promise<void> {
  const path = info.outputPath(`${name}.png`);

  await page.screenshot({ path });
  await info.attach(name, { path, contentType: "image/png" });
}

const WIDTHS = [
  [1440, "full"],
  [390, "phone narrow medium wide full"],
] as const;

const PLACES = [
  ["the List pane", "pane", {}],
  ["the Grid sheet", "sheet", { layout: "grid", openAs: "sheet" }],
] as const;

for (const [where, place, stored] of PLACES) {
  for (const forced of [false, true]) {
    test(`the Note box in ${where} breaks no design rule in its saved, edited, too long, failed and newer-version states in Light, Dark and Sepia at 1440 and 390 px${forced ? " in forced colours" : ""}`, async () => {
      const { page, context } = screenOf();
      const info = test.info();
      await page.emulateMedia({ forcedColors: forced ? "active" : "none" });

      for (const theme of THEMES) {
        for (const [width, bands] of WIDTHS) {
          const tag = `d${forced ? "f" : "n"}${place[0]}${theme[0]}${width}`;
          const id = await seedThread(screenOf(), thread(tag));
          await saved(context.request, id, "Saved note text for the design walk.", 0);
          const name = `${where}, ${theme} at ${width}px${forced ? " forced" : ""}`;
          await openReader(page, id, width, { theme, ...stored });
          await resize(page, width, bands);
          await walkStates(
            page,
            id,
            context.request,
            name,
            { forced, narrow: width < 480 },
            (state) =>
              shoot(
                page,
                info,
                `note-${place}-${theme}-${width}${forced ? "-forced" : ""}-${state}`,
              ),
          );
        }
      }

      await page.emulateMedia({ forcedColors: "none" });
    });
  }
}
