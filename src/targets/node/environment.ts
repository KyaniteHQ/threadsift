import { join, resolve } from "node:path";

import { z } from "zod";

import { unsetWhenEmpty, type SettingVariables } from "../shared/settings.ts";
import type { OperatorCodeOptions } from "./operator-code.ts";

export const REPOSITORY_ROOT = resolve(import.meta.dirname, "../../..");

const ProcessSchema = z.object({
  PORT: z.coerce.number().int().min(0).max(65_535).default(8080),
  DATA_DIR: z.string().default(join(REPOSITORY_ROOT, ".data")),
  PATH: z.string().default(""),
});

export interface NodeEnvironment {
  readonly port: number;
  readonly dataDir: string;
  readonly variables: SettingVariables;
  readonly operator: OperatorCodeOptions;
}

export function nodeEnvironment(source: Readonly<NodeJS.ProcessEnv>): NodeEnvironment {
  const { PORT: port, DATA_DIR: dataDir, PATH: path } = ProcessSchema.parse(source);

  return {
    port,
    dataDir,
    variables: {
      SETUP_CODE: source["SETUP_CODE"],
      PASSWORD_RESET_CODE: source["PASSWORD_RESET_CODE"],
      THREADSIFT_SECRET_KEY: source["THREADSIFT_SECRET_KEY"],
      THREADSIFT_PUBLIC_ORIGIN: source["THREADSIFT_PUBLIC_ORIGIN"],
      THREADSIFT_OPENROUTER_MAX_PRICE_ZERO: source["THREADSIFT_OPENROUTER_MAX_PRICE_ZERO"],
    },
    operator: {
      fetchers: source["THREADSIFT_FETCHERS"],
      claude: {
        path,
        configDir: unsetWhenEmpty(source["CLAUDE_CONFIG_DIR"]),
        token: unsetWhenEmpty(source["CLAUDE_CODE_OAUTH_TOKEN"]),
      },
      codex: { path, home: unsetWhenEmpty(source["CODEX_HOME"]), dataDir },
      grok: { path, home: source["GROK_HOME"], dataDir },
    },
  };
}
