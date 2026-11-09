import { expect, test } from "@playwright/test";

import { postLinkRaw } from "./api.ts";
import { lines, marker, runStep, started, stored } from "./identity-run.ts";
import { type Seed, migrationsBefore } from "./seeded.ts";

test.describe.configure({ timeout: 480_000 });

const ARTICLE_OLD = "https://www.example.com/essay?utm_source=feed#top";
const ARTICLE_NEW = "https://example.com/essay";
const LINK_OLD = "https://www.example.org/page?utm_medium=mail";
const LINK_NEW = "https://example.org/page";
const TWIN_OLD = "https://www.example.net/post?fbclid=1";
const TWIN_HELD = "https://example.net/post";

const SEED: Seed = {
  files: migrationsBefore("0024"),
  sql: `
INSERT INTO items (id, source, kind, normalized_url, original_url, saved_at) VALUES
  (1, 'article', 'article', '${ARTICLE_OLD}', '${ARTICLE_OLD}', 1001),
  (2, 'other', 'link', '${LINK_OLD}', '${LINK_OLD}', 1002),
  (3, 'article', 'article', '${TWIN_OLD}', '${TWIN_OLD}', 1003),
  (4, 'article', 'article', '${TWIN_HELD}', '${TWIN_HELD}', 1004);
`,
};

test("the step gives a stored Article the identity a Paste of its link would get, like a stored link, and reports an Article whose new identity another Item holds", async () => {
  const { instance, owner } = await started(SEED);

  try {
    await runStep(owner, instance);

    expect(marker(instance)).toEqual([{ name: "item-identity", version: 1, cursor: null }]);

    const after = new Map(stored(instance).map(({ id, normalized_url: url }) => [id, url]));

    expect(after.get(1), "the Article").toBe(ARTICLE_NEW);
    expect(after.get(2), "the link").toBe(LINK_NEW);
    expect(after.get(3), "the Article whose new identity Item 4 holds").toBe(TWIN_OLD);
    expect(after.get(4)).toBe(TWIN_HELD);

    const reported = lines(instance, "item-identity-collision").filter((line) =>
      line.includes(`"identity":"${TWIN_HELD}"`),
    );

    expect(reported).toHaveLength(1);
    expect(reported[0]).toContain('"itemIds":[3,4]');

    const again = await postLinkRaw(owner, ARTICLE_OLD);

    expect([again.status, again.body.item.id]).toEqual([200, 1]);
  } finally {
    await owner.dispose();
    instance.stop();
  }
});
