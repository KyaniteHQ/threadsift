import { test } from "@playwright/test";

import { DEFAULTS, SETTINGS } from "../design/system/settings.ts";
import { checkStyle } from "./style.ts";

test.describe.configure({ mode: "parallel" });

for (const option of SETTINGS.find((row) => row.key === "style")?.options ?? []) {
  if (option.id !== DEFAULTS.style) {
    test(`${option.label} keeps its faces and design checks in every theme at four widths`, async ({
      page,
    }, info) => {
      await checkStyle(page, info, option.id);
    });
  }
}
