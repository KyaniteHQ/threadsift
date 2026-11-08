import { expect, test } from "@playwright/test";

import { projectText } from "../src/core/text-projection.ts";
import { mainInstance } from "./access.ts";
import { postLink } from "./api.ts";
import { ESSAY, ESSAY_SENTENCE } from "./articles.ts";
import { created, highlightsOf, selectorOf, statuses } from "./highlights.ts";
import { jobsOf } from "./ingest.ts";

test.describe.configure({ timeout: 240_000 });

test("a Highlight on a fetched article is found again, at the same place, when a Paste of the link fetches the page again", async ({
  request,
}) => {
  const { body } = await postLink(request, ESSAY);
  const { item } = body;

  expect(item).toMatchObject({ status: "ready", fetch: "ok" });
  expect(item.postText).toContain(ESSAY_SENTENCE);

  const projection = projectText(item.postText ?? "");
  const before = await highlightsOf(request, item.id);

  const saved = await created(request, item.id, {
    target: { kind: "post" },
    revision: before.revisions.post,
    selector: selectorOf(projection, ESSAY_SENTENCE),
  });

  expect(saved.status).toBe("attached");

  const instance = mainInstance();
  const fetches = () => jobsOf(item.id, instance, "fetch").filter((job) => job.state === "done");
  const fetched = fetches().length;

  expect((await postLink(request, ESSAY)).status).toBe(200);
  await expect.poll(() => fetches().length, { timeout: 60_000 }).toBeGreaterThan(fetched);

  const after = await highlightsOf(request, item.id);

  expect(statuses(after)).toEqual([
    {
      id: saved.id,
      status: "attached",
      revision: after.revisions.post,
      start: saved.status === "attached" ? saved.start : -1,
    },
  ]);
});
