import { expect, test } from "@playwright/test";
import { z } from "zod";

import { type Instance, freshDir, newCode } from "./access.ts";
import { BEFORE_REVISION_EMPTY, BEFORE_REVISION_WITH_SETTINGS } from "./connect-seed.ts";
import { launchSeeded } from "./seeded.ts";

const Revision = z.array(z.object({ id: z.number(), revision: z.number() }));

const Settings = z.array(
  z.object({
    provider: z.string(),
    base_url: z.string(),
    model: z.string(),
    sealed_key: z.string(),
  }),
);

const Tables = z.array(z.object({ name: z.string() }));

function revisionOf(instance: Instance): number {
  const rows = instance.query("SELECT id, revision FROM ai_settings_revision", Revision);
  expect(
    rows.map((row) => row.id),
    "one counter row",
  ).toEqual([1]);

  return rows[0]?.revision ?? -1;
}

function upsertLikeThePreviousRelease(model: string): string {
  return `INSERT INTO settings (id, provider, base_url, model, sealed_key) VALUES (1, 'openrouter', 'https://openrouter.ai/api/v1', '${model}', 'v1.old.writer') ON CONFLICT (id) DO UPDATE SET provider = excluded.provider, base_url = excluded.base_url, model = excluded.model, sealed_key = excluded.sealed_key`;
}

test.describe.configure({ timeout: 240_000 });

test("A database with saved settings keeps them, starts the revision at 0, and counts every write the previous release can make", () => {
  const instance = launchSeeded(freshDir(), newCode(), BEFORE_REVISION_WITH_SETTINGS);

  try {
    const kept = [
      {
        provider: "openrouter",
        base_url: "https://openrouter.ai/api/v1",
        model: "kept-model",
        sealed_key: "v1.kept.kept",
      },
    ];

    expect(instance.query("SELECT * FROM settings", Settings)).toEqual(kept);
    expect(revisionOf(instance), "the existing settings are not a change").toBe(0);

    instance.sql(upsertLikeThePreviousRelease("kept-model"));
    expect(revisionOf(instance), "an upsert that changes nothing is still a write").toBe(1);

    instance.sql(upsertLikeThePreviousRelease("other-model"));
    expect(revisionOf(instance), "an upsert that changes the model").toBe(2);

    instance.sql("DELETE FROM settings");
    expect(revisionOf(instance), "a delete").toBe(3);

    instance.sql(upsertLikeThePreviousRelease("again"));
    expect(revisionOf(instance), "an insert after the delete").toBe(4);

    instance.restart();
    expect(revisionOf(instance), "the counter survives a restart").toBe(4);
  } finally {
    instance.stop();
  }
});

test("A database with no settings starts the revision at 0, has the attempt table, and counts the first save", () => {
  const instance = launchSeeded(freshDir(), newCode(), BEFORE_REVISION_EMPTY);

  try {
    expect(
      instance.query(
        "SELECT count(*) AS name FROM settings",
        z.array(z.object({ name: z.number() })),
      ),
    ).toEqual([{ name: 0 }]);
    expect(revisionOf(instance)).toBe(0);

    expect(
      instance
        .query(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'openrouter_connect%'",
          Tables,
        )
        .map((row) => row.name),
    ).toEqual(["openrouter_connect_transactions"]);

    instance.sql(upsertLikeThePreviousRelease("first"));
    expect(revisionOf(instance)).toBe(1);
  } finally {
    instance.stop();
  }
});
