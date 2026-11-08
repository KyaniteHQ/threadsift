import { type Seed, migrationsBefore } from "./seeded.ts";

const SAVED = `
INSERT INTO settings (id, provider, base_url, model, sealed_key) VALUES
  (1, 'openrouter', 'https://openrouter.ai/api/v1', 'kept-model', 'v1.kept.kept');
`;

export const BEFORE_REVISION_WITH_SETTINGS: Seed = {
  files: migrationsBefore("0021"),
  sql: SAVED,
};

export const BEFORE_REVISION_EMPTY: Seed = { files: migrationsBefore("0021"), sql: "SELECT 1;" };
