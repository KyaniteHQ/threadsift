import { expect, request, test } from "@playwright/test";

import { agentToken, bearer } from "./access.ts";
import { type Upload, slowLink } from "./slow-link.ts";

const MIB = 1024 * 1024;
const ROUNDS = 3;

const UPLOADS: readonly Upload[] = ["buffered", "paced"];

for (const upload of UPLOADS) {
  test(`a refused 9 MiB body is answered with 413 and the next request on the same request context is answered, over a slow link that takes the upload ${upload}`, async ({
    baseURL,
  }) => {
    const link = await slowLink(baseURL ?? "", upload);

    const owner = await request.newContext({
      baseURL: link.url,
      extraHTTPHeaders: bearer(agentToken()),
    });

    try {
      for (let round = 1; round <= ROUNDS; round += 1) {
        const refused = await owner.post("/api/items", {
          data: { url: "https://example.com/", content: "x".repeat(9 * MIB) },
        });

        expect(refused.status(), `refused body ${round}`).toBe(413);

        const next = await owner.get("/api/items");

        expect(next.status(), `request after refused body ${round}`).toBe(200);
      }
    } finally {
      await owner.dispose();
      await link.stop();
    }
  });
}
