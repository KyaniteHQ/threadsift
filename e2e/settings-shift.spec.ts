import { type Page, expect, test } from "@playwright/test";

import { SETTINGS } from "../web/src/access-text.ts";
import { AI_TEXT } from "../web/src/ai-text.ts";
import { GITHUB_TEXT } from "../web/src/github-text.ts";
import { aiScreen, newSealingKey } from "./ai.ts";
import { type FreshScreen } from "./fresh-screen.ts";
import { GITHUB_SETTINGS_ENDPOINT, githubSection } from "./github-token.ts";
import { watchLayout } from "./layout-shift.ts";
import { DESKTOP, afterTwoFrames } from "./look.ts";
import { revokeOf } from "./tokens.ts";

const PHONE = { width: 390, height: 844 } as const;
const SECTIONS = 5;
const SEEDED = ["Seeded token 1", "Seeded token 2", "Seeded token 3"] as const;
const DEADLINE_MARGIN_MS = 30_000;

const ANSWERS = ["ai", "github", "tokens"] as const;

type Answer = (typeof ANSWERS)[number];

const READS = {
  ai: /\/api\/settings\/ai$/u,
  github: /\/api\/settings\/github$/u,
  tokens: /\/api\/tokens$/u,
} as const;

const TABLES = { ai: "settings", github: "github_settings", tokens: "agent_tokens" } as const;

let screen: FreshScreen;

test.describe.configure({ timeout: 120_000 });

test.beforeAll(async ({ browser }) => {
  screen = await aiScreen(browser, newSealingKey());
  const { request } = screen.context;

  const ai = await request.put("/api/settings/ai", {
    data: { provider: "openrouter", model: "layout-shift-proof", key: "layout-shift-proof-key" },
  });

  expect(ai.ok(), "a saved Provider other than the default one").toBe(true);

  const github = await request.put(GITHUB_SETTINGS_ENDPOINT, {
    data: { token: "layout-shift-proof-token" },
  });

  expect(github.ok(), "a saved GitHub token").toBe(true);

  for (const name of SEEDED) {
    const created = await request.post("/api/tokens", { data: { name } });

    expect(created.ok(), `the agent token ${name}`).toBe(true);
  }
});

test.afterAll(async () => {
  await screen.close();
});

async function holdReads(page: Page) {
  const releases = new Map(ANSWERS.map((answer) => [answer, Promise.withResolvers<void>()]));
  const reached = new Map(ANSWERS.map((answer) => [answer, Promise.withResolvers<void>()]));

  for (const answer of ANSWERS)
    await page.route(READS[answer], async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();

        return;
      }

      const response = await route.fetch();
      reached.get(answer)?.resolve();
      await releases.get(answer)?.promise;
      await route.fulfill({ response });
    });

  return {
    arrived: Promise.all([...reached.values()].map((entry) => entry.promise)),
    release: (answer: Answer) => {
      releases.get(answer)?.resolve();
    },
  };
}

async function breakReads(broken: readonly Answer[], run: () => Promise<void>) {
  for (const answer of broken)
    screen.fresh.sql(`ALTER TABLE ${TABLES[answer]} RENAME TO ${TABLES[answer]}_off`);

  try {
    await run();
  } finally {
    for (const answer of broken)
      screen.fresh.sql(`ALTER TABLE ${TABLES[answer]}_off RENAME TO ${TABLES[answer]}`);
  }
}

async function expectSettled(page: Page, failed: ReadonlySet<Answer>) {
  await expect(
    failed.has("ai")
      ? page.getByText(AI_TEXT.loadFailed, { exact: true })
      : page.getByRole("button", { name: AI_TEXT.save, exact: true }),
  ).toBeVisible({ timeout: DEADLINE_MARGIN_MS });

  await expect(
    failed.has("github")
      ? page.getByText(GITHUB_TEXT.loadFailed, { exact: true })
      : githubSection(page).getByRole("button", { name: GITHUB_TEXT.save, exact: true }),
  ).toBeVisible({ timeout: DEADLINE_MARGIN_MS });

  await expect(
    failed.has("tokens")
      ? page.getByText(SETTINGS.tokensLoadFailed, { exact: true })
      : revokeOf(page, SEEDED[0]),
  ).toBeVisible({ timeout: DEADLINE_MARGIN_MS });
}

interface Visit {
  readonly size: Readonly<{ width: number; height: number }>;
  readonly answers: readonly Answer[];
  readonly broken?: readonly Answer[];
}

async function visitSettings({ size, answers, broken = [] }: Readonly<Visit>) {
  const page = await screen.context.newPage();

  try {
    await page.setViewportSize(size);

    const watch = await watchLayout(page);
    const held = await holdReads(page);

    const failed = new Set<Answer>([
      ...broken,
      ...ANSWERS.filter((answer) => !answers.includes(answer)),
    ]);

    await breakReads(broken, async () => {
      await page.goto("/settings");
      await held.arrived;

      for (const answer of answers) {
        held.release(answer);
        await afterTwoFrames(page);
      }

      await expectSettled(page, failed);
    });

    await afterTwoFrames(page);
    await afterTwoFrames(page);

    return await watch.snapshot();
  } finally {
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await page.close();
  }
}

async function expectNothingMoved(visit: Readonly<Visit>) {
  const { shift, headings } = await visitSettings(visit);

  expect(Object.keys(headings), "section headings seen").toHaveLength(SECTIONS);
  expect(shift, "layout shift from navigation").toBe(0);

  for (const [heading, tops] of Object.entries(headings))
    expect(tops, `document positions of ${heading}`).toHaveLength(1);
}

const ORDERS = [
  ["ai", "github", "tokens"],
  ["tokens", "github", "ai"],
  ["github", "tokens", "ai"],
] as const;

for (const [size, label] of [
  [PHONE, "a phone"],
  [DESKTOP, "a desktop"],
] as const) {
  for (const answers of ORDERS)
    test(`on ${label} no section moves when the answers come as ${answers.join(", ")}`, async () => {
      await expectNothingMoved({ size, answers });
    });

  for (const broken of [["ai"], ["github"], ["tokens"], ["ai", "github", "tokens"]] as const)
    test(`on ${label} no section moves when the ${broken.join(" and ")} read fails`, async () => {
      await expectNothingMoved({ size, answers: ["tokens", "ai", "github"], broken });
    });
}

test("on a desktop a read that never answers is given up on and moves no section", async () => {
  await expectNothingMoved({ size: DESKTOP, answers: ["ai", "github"] });
});
