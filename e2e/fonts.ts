import type { Page } from "@playwright/test";

const FAMILY_TOKENS = ["--f-display", "--f-ui", "--f-read", "--f-mono"] as const;

export function watchRequests(page: Page) {
  const origins = new Set<string>();
  const fontFiles: { url: string; status: number }[] = [];
  page.on("request", (request) => origins.add(new URL(request.url()).origin));
  page.on("response", (response) => {
    if (response.request().resourceType() === "font") {
      fontFiles.push({ url: response.url(), status: response.status() });
    }
  });

  return { origins, fontFiles };
}

export function loadFamilies(page: Page) {
  return page.evaluate((tokens) => {
    const style = getComputedStyle(document.querySelector(".app") ?? document.body);

    const families = new Set(
      tokens.map((token) =>
        (style.getPropertyValue(token).split(",")[0] ?? "").trim().replaceAll(/^["']|["']$/gu, ""),
      ),
    );

    return Promise.all(
      [...families].map(async (family) => {
        const faces = await document.fonts.load(`1em "${family}"`);

        return {
          family,
          faces: faces.length,
          loaded: faces.length > 0 && faces.every((face) => face.status === "loaded"),
        };
      }),
    );
  }, FAMILY_TOKENS);
}
