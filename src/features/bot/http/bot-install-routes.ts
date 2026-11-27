import { type OpenAPIHono, createRoute } from "@hono/zod-openapi";

import {
  BotInstallAnswerSchema,
  BotInstallReportSchema,
  BotUpdateInputSchema,
  BotUpdateViewSchema,
} from "../../../core/contract/bot-install-contract.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import { access } from "../../../http/access.ts";
import { jsonBody, jsonRequest, accessNote, accessRefusals } from "../../../http/openapi.ts";
import { readBotUpdate, reportBotInstall, saveBotUpdate } from "../core/bot-install.ts";

const OWNER = access("owner");

const BOT = access("add");

const VIEW_TEXT =
  "The bot release this Instance expects (`expected`), whether the bot installs it by itself (`autoInstall`, `true` when the owner never chose), and the bot's last report: `unreported`, `current` (it runs the expected release), `waits` (it runs another release), `skill-waits` (it installed the expected release's files and its skill is still the one of `skill`) or `refused` (the files of the expected release did not match its hashes, so the bot installed nothing).";

const reportRoute = createRoute({
  method: "put",
  path: "/api/bot/install",
  middleware: BOT,
  description: accessNote(BOT),
  request: { body: jsonRequest(BotInstallReportSchema) },
  responses: {
    ...accessRefusals(BOT),
    200: jsonBody(
      BotInstallAnswerSchema,
      "The Threadsift bot reports the release of its files (`version`), of its skill (`skill`) and the release it refused because a hash did not match (`refused`), and gets back the release this Instance expects: its tag, the SHA-256 of its `SHA256SUMS` and of its `SKILL.md`, and whether the owner lets the bot install it by itself. The report replaces the last one.",
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
  app.openapi(reportRoute, async (c) =>
    c.json(await reportBotInstall(ports, c.req.valid("json")), 200),
  );
  app.openapi(readRoute, async (c) => c.json(await readBotUpdate(ports), 200));
  app.openapi(saveRoute, async (c) =>
    c.json(await saveBotUpdate(ports, c.req.valid("json").autoInstall), 200),
  );
}
