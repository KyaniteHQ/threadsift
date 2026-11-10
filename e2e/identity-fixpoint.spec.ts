import { expect, test } from "@playwright/test";

import { postLinkRaw } from "./api.ts";
import { marker, started, stored } from "./identity-run.ts";
import { sweepNow } from "./ingest.ts";
import { type Seed, migrationsBefore } from "./seeded.ts";

test.describe.configure({ timeout: 480_000 });

const LINK_ONCE = "https://www.example.com/fixpoint";
const LINK_FIXED = "https://example.com/fixpoint";
const REPOSITORY_ONCE = "https://github.com/owner/repo.git";
const REPOSITORY_FIXED = "https://github.com/owner/repo";
const PASTED = "https://www.www.example.com/fixpoint?utm_source=feed";

const SEED: Seed = {
  files: migrationsBefore("9999"),
  sql: `
INSERT INTO items (id, source, kind, normalized_url, original_url, saved_at) VALUES
  (1, 'other', 'link', '${LINK_ONCE}', '${PASTED}', 1001),
  (2, 'github', 'github-repo', '${REPOSITORY_ONCE}', 'https://github.com/Owner/Repo.git.git', 1002);
INSERT INTO data_steps (name, version, cursor) VALUES ('item-identity', 1, NULL);
`,
};

test("an Item stored under the form a first pass of parseLink left takes the form that parseLink keeps, and a Paste of the link it came from reaches it", async () => {
  const { instance, owner } = await started(SEED);

  try {
    await sweepNow(owner, instance);
    await expect.poll(() => marker(instance).at(0)?.version ?? 0, { timeout: 90_000 }).toBe(2);

    expect(stored(instance).map(({ id, normalized_url: url }) => [id, url])).toEqual([
      [1, LINK_FIXED],
      [2, REPOSITORY_FIXED],
    ]);

    const again = await postLinkRaw(owner, PASTED);

    expect([again.status, again.body.item.id]).toEqual([200, 1]);
  } finally {
    await owner.dispose();
    instance.stop();
  }
});
