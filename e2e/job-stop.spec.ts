import { expect, test } from "@playwright/test";

import { mainInstance } from "./access.ts";
import { postLinkRaw, settled } from "./api.ts";
import { STALLED, jobsOf, waitForRunning } from "./ingest.ts";
import { newRunId } from "./links.ts";
import { isContainerTarget } from "./target.ts";

test.skip(!isContainerTarget(), "A stop that leaves running work behind is a container case.");

test("a graceful stop lets a running fetch end in the stopping process, so the next start takes nothing over", async ({
  request,
}) => {
  const { body } = await postLinkRaw(request, `${STALLED}?run=${newRunId()}&step=stop`);
  const id = body.item.id;

  await waitForRunning(id);
  mainInstance().restart();

  expect(await settled(request, id)).toMatchObject({ status: "failed", reason: "timeout" });
  expect(jobsOf(id)).toEqual([expect.objectContaining({ state: "done", attempts: 0 })]);
});
