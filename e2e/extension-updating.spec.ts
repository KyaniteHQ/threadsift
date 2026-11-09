import { expect, test } from "@playwright/test";

import { createToken } from "./access-helpers.ts";
import { listAll } from "./api.ts";
import { ESSAY } from "./articles.ts";
import { savedItemId } from "./extension-session.ts";
import { ACTION_TEXT, loadExtension } from "./extension.ts";
import { attemptStep, runStep, started } from "./identity-run.ts";
import { FAILING_BEFORE } from "./identity-seed.ts";

test.describe.configure({ timeout: 480_000 });

test("while a release is still rewriting the stored Items the popup says so, and Try again saves the page once the rewrite has finished", async () => {
  const { instance, owner } = await started(FAILING_BEFORE);
  const extension = await loadExtension({ instanceUrl: instance.url });

  try {
    await attemptStep(owner, instance);

    const { value } = await createToken(owner, "Extension");
    await extension.configure(instance.url, value);

    const before = (await listAll(owner)).length;
    const popup = await extension.press(await extension.tab(ESSAY));

    await expect.poll(() => popup.status()).toBe(ACTION_TEXT.updating);
    expect(await listAll(owner)).toHaveLength(before);

    instance.sql("DROP TRIGGER stop_batch");
    await runStep(owner, instance);
    await popup.click(ACTION_TEXT.tryAgain);

    await savedItemId(popup, instance.url);
    expect(await listAll(owner)).toHaveLength(before + 1);
  } finally {
    await extension.close();
    await owner.dispose();
    instance.stop();
  }
});
