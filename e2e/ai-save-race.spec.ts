import { expect, test } from "@playwright/test";

import { SAME_ORIGIN } from "./access.ts";
import { AI_SETTINGS_ENDPOINT, aiScreen, newSealingKey, openSealed, sealedKey } from "./ai.ts";

test.use({ trace: "off", video: "off", screenshot: "off" });

test.describe.configure({ timeout: 240_000 });

const ROUNDS = 40;
const KEEPING_SAVES = 4;

const PROVIDER = {
  provider: "openai-compatible",
  baseUrl: "https://llm.example.com/v1",
  model: "race-model",
} as const;

test("a Save that keeps the stored key never writes back a key it read before a newer Save replaced it", async ({
  browser,
}) => {
  const secret = newSealingKey();
  const screen = await aiScreen(browser, secret);

  try {
    const put = (body: Readonly<Record<string, string>>) =>
      screen.context.request.put(AI_SETTINGS_ENDPOINT, { data: body, headers: SAME_ORIGIN });

    const lost: number[] = [];

    for (let round = 0; round < ROUNDS; round += 1) {
      expect((await put({ ...PROVIDER, key: `first-${round}` })).status()).toBe(200);

      const replacing = put({ ...PROVIDER, key: `newer-${round}` });
      const keeping = Array.from({ length: KEEPING_SAVES }, () => put(PROVIDER));

      const answers = await Promise.all([replacing, ...keeping]);

      expect(answers.map((answer) => answer.status())).toEqual(answers.map(() => 200));

      if (openSealed(sealedKey(screen), secret) !== `newer-${round}`) lost.push(round);
    }

    expect(
      lost,
      "rounds where the stored key went back to the one read before the newer Save",
    ).toEqual([]);
  } finally {
    await screen.close();
  }
});
