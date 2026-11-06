import { test } from "@playwright/test";

import { checkStyle } from "./style-checks.ts";

const STYLES = [
  {
    id: "anthropic",
    display: "Source Serif 4 Variable",
    body: "Source Serif 4 Variable",
    radius: "24px",
  },
  { id: "slash", display: "Playfair Display Variable", body: "Inter Variable", radius: "10px" },
  { id: "modal", display: "Space Grotesk Variable", body: "Inter Variable", radius: "8px" },
  { id: "mymind", display: "Playfair Display Variable", body: "DM Sans Variable", radius: "16px" },
  { id: "monocle", display: "Spectral", body: "Spectral", radius: "0px" },
  { id: "linear", display: "Inter Variable", body: "Inter Variable", radius: "12px" },
  { id: "switch-lit", display: "Fraunces Variable", body: "Inter Variable", radius: "12px" },
  { id: "cursor", display: "Inter Variable", body: "EB Garamond Variable", radius: "4px" },
  { id: "steep", display: "Newsreader Variable", body: "Inter Variable", radius: "24px" },
  { id: "cal-com", display: "Cal Sans", body: "Inter Variable", radius: "12px" },
] as const;

test.describe.configure({ mode: "parallel" });

for (const style of STYLES) {
  test(`${style.id} keeps its specified faces, radius and design checks in every theme at four widths`, async ({
    page,
  }, info) => {
    await checkStyle(page, info, style);
  });
}
