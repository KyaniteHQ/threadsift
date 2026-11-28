import { type OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";

import {
  BotInstallAnswerSchema,
  BotInstallReportSchema,
  BotUpdateInputSchema,
  BotUpdateViewSchema,
} from "../../../core/contract/bot-install-contract.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import { access } from "../../../http/access.ts";
import { jsonBody, jsonRequest, accessNote, accessRefusals } from "../../../http/openapi.ts";
import { callerOf } from "../../../http/token-scopes.ts";
import { readBotUpdate, reportBotInstall, saveBotUpdate } from "../core/bot-install.ts";

const OWNER = access("owner");

const BOT = access("add");

const ONLY_AGENT_TOKENS_REPORT = "Only an agent token reports the bot's install";

const VIEW_TEXT =
  "The bot release this Instance expects (`expected`), whether the bot installs it by itself (`autoInstall`, `true` when the owner never chose), and the bot's last report with its time in milliseconds since the epoch (`reportedAt`): `unreported`, `current` (it runs the expected release), `waits` (it runs an older release), `ahead` (it runs a newer release, which it keeps), `skill-waits` (it installed the expected release's files and its skill is still the one of `skill`) or `refused` (the files of the expected release did not match its hashes, so the bot installed nothing).";

const reportRoute = createRoute({
  method: "put",
  path: "/api/bot/install",
  middleware: BOT,
  description: accessNote(BOT),
  request: { body: jsonRequest(BotInstallReportSchema) },
  responses: {
    ...accessRefusals(BOT, ` ${ONLY_AGENT_TOKENS_REPORT}, so the owner's session is refused too.`),
    200: jsonBody(
      BotInstallAnswerSchema,
      "The Threadsift bot reports the release of its files (`version`), of its skill (`skill`) and the release it refused because a hash did not match (`refused`), and gets back the release this Instance expects: its tag, the SHA-256 of its `RELEASE.sha256`, which lists the SHA-256 of every file the release installs, and whether the owner lets the bot install it by itself. The report replaces the last one and records the time and the agent token that sent it.",
    ),
  },
});

const readRoute = createRoute({
  method: "get",
  path: "/api/settings/bot-update",
  middleware: OWNER,
  description: accessNote(OWNER),
  responses: { ...accessRefusals(OWNER), 200: jsonBody(BotUpdateViewSchema, VIEW_TEXT) },
});

const saveRoute = createRoute({
  method: "put",
  path: "/api/settings/bot-update",
  middleware: OWNER,
  description: accessNote(OWNER),
  request: { body: jsonRequest(BotUpdateInputSchema) },
  responses: {
    ...accessRefusals(OWNER),
    200: jsonBody(
      BotUpdateViewSchema,
      `The settings after the change. The bot reads \`autoInstall\` at its next report. ${VIEW_TEXT}`,
    ),
  },
});

export function registerBotInstallRoutes(app: OpenAPIHono, ports: Ports): void {
  app.openapi(reportRoute, async (c) => {
    const caller = callerOf(c);

    if (caller.kind !== "token") {
      throw new HTTPException(403, { message: `${ONLY_AGENT_TOKENS_REPORT}.` });
    }

    return c.json(
      await reportBotInstall(ports, c.req.valid("json"), { tokenId: caller.id, at: Date.now() }),
      200,
    );
  });
  app.openapi(readRoute, async (c) => c.json(await readBotUpdate(ports), 200));
  app.openapi(saveRoute, async (c) =>
    c.json(await saveBotUpdate(ports, c.req.valid("json").autoInstall), 200),
  );
}
