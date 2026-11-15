import { TEXT } from "../../extension/lib/text.ts";
import { pause as sleep } from "../../src/core/pause.ts";
import { snapshot } from "./browser.ts";
import { type ItemView, itemOf } from "./instance.ts";
import { record } from "./report.ts";
import { type Run, threadUrl } from "./run-types.ts";
import { STREAM_LIMIT, type Entry } from "./stand-in.ts";

const PAGE_BLOCKED_TEXT =
  "Your browser doesn’t let extensions read this page, so it can’t be saved.";

interface Case {
  readonly postId: string;
  readonly popup: string;
  readonly why: string;
  readonly holds: (item: Readonly<ItemView> | null, served: readonly Entry[]) => boolean;
}

const CASES: readonly Case[] = [
  {
    postId: "under1",
    popup: TEXT.saved,
    why: "an answer of 4 MiB minus 8 KiB is read and saved whole",
    holds: (item) => item?.fillable === false && item.status === "ready",
  },
  {
    postId: "overlen1",
    popup: TEXT.savedPage,
    why: "an answer of 4 MiB plus 8 KiB with a Content-Length is refused and the page is saved instead",
    holds: (item) => item?.fillable === true && item.commentCount === null,
  },
  {
    postId: "overchunk1",
    popup: TEXT.savedPage,
    why: "a 6 MiB answer with no Content-Length is cut once the stream passes 4 MiB and the page is saved instead",
    holds: (item, served) =>
      item?.fillable === true &&
      served.some(
        ({ kind, closedEarly, bytes }) =>
          kind === "thread-json" && closedEarly && bytes > STREAM_LIMIT && bytes < 6 * 1024 * 1024,
      ),
  },
  {
    postId: "stubover1",
    popup: TEXT.savedIncomplete,
    why: "a replies answer over 4 MiB is cut and the thread is saved with that stub unfilled",
    holds: (item, served) =>
      item?.fillable === false &&
      served.some(({ kind, closedEarly }) => kind === "permalink" && closedEarly),
  },
];

async function saveActiveTab(
  run: Readonly<Run>,
  postId: string,
): Promise<{ before: string; after: string }> {
  const { context, extensionId, observed } = run.session;
  const tab = await context.newPage();
  await tab.goto(threadUrl(postId));

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);

  const again = popup.getByRole("button", { name: TEXT.tryAgain });
  await again.waitFor({ timeout: 15_000 });

  const before = await popup.locator(".ext-status").first().innerText();
  await tab.bringToFront();
  await again.click();
  await popup.waitForFunction(
    (blocked) => {
      const text = document.querySelector(".ext-status")?.textContent ?? "";

      return text !== "Saving…" && text !== blocked;
    },
    PAGE_BLOCKED_TEXT,
    { timeout: 60_000 },
  );
  await sleep(500);

  const after = await popup.locator(".ext-status").first().innerText();
  await snapshot(popup, observed);
  await popup.close();
  await tab.close();

  return { before, after };
}

export async function limitChecks(run: Readonly<Run>): Promise<void> {
  for (const one of CASES) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- each save uses the active tab, so the cases run one at a time.
    const { before, after } = await saveActiveTab(run, one.postId);
    // oxlint-disable-next-line eslint/no-await-in-loop -- read after the save above.
    const item = await itemOf(run.instance, one.postId);
    const served = run.standIn.log.filter(({ postId }) => postId === one.postId);

    record(
      `limit: ${one.postId}: ${one.why}`,
      after === one.popup && one.holds(item, served),
      JSON.stringify({
        popupBeforeTryAgain: before,
        popup: after,
        item,
        served: served.map(({ kind, bytes, closedEarly }) => ({ kind, bytes, closedEarly })),
      }),
    );
  }
}
