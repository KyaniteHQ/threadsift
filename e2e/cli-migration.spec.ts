import { expect, test } from "@playwright/test";

import { AiSettingsViewSchema } from "../src/core/ai-contract.ts";
import { freshDir, newCode } from "./access.ts";
import { ownerOf } from "./files.ts";
import { launchSeeded, migrationsBefore } from "./seeded.ts";

const BEFORE_CLI = {
  files: migrationsBefore("0018"),
  sql: "INSERT INTO settings (id, provider, base_url, model, sealed_key) VALUES (1, 'openrouter', 'https://openrouter.ai/api/v1', 'kept-model', 'v1.sealed.value')",
};

test("a keyed Provider row survives the CLI migration, and the settings constraint then allows a CLI row with no URL or key and only that", async () => {
  test.setTimeout(180_000);
  const code = newCode();
  const instance = launchSeeded(freshDir(), code, BEFORE_CLI);

  try {
    const owner = await ownerOf(instance, code, "m".repeat(20));

    const read = async () =>
      AiSettingsViewSchema.parse(await (await owner.get("/api/settings/ai")).json());

    expect((await read()).settings).toEqual({
      provider: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      model: "kept-model",
      keySet: true,
    });

    instance.sql("DELETE FROM settings");
    instance.sql(
      "INSERT INTO settings (id, provider, base_url, model, sealed_key) VALUES (1, 'claude-code', NULL, '', NULL)",
    );
    expect((await read()).settings).toEqual({ provider: "claude-code", model: "" });

    instance.sql("DELETE FROM settings");

    for (const row of [
      "'claude-code', 'https://example.com', '', NULL",
      "'openrouter', NULL, 'm', NULL",
    ]) {
      expect(() => {
        instance.sql(
          `INSERT INTO settings (id, provider, base_url, model, sealed_key) VALUES (1, ${row})`,
        );
      }).toThrow();
    }

    await owner.dispose();
  } finally {
    instance.stop();
  }
});
