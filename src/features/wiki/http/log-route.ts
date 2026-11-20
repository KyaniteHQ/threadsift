import { type OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "zod";

import { byteSize } from "../../../core/contract/format.ts";
import { LOG_ACTIONS, type LogAction } from "../../../core/contract/log-actions.ts";
import { LogPageSchema } from "../../../core/contract/log-contract.ts";
import { PAGE_SIZE, parseNumberCursor } from "../../../core/contract/paging.ts";
import { GITHUB_FILE_BYTES } from "../../../core/contract/vault-contract.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import { access } from "../../../http/access.ts";
import { accessNote, accessRefusals, codeList, jsonBody } from "../../../http/openapi.ts";
import { cursorParam } from "../../../http/route-input.ts";
import { readLog } from "../core/log-page.ts";

const LogQuerySchema = z.object({ cursor: cursorParam(parseNumberCursor) });

const READER = access("read");

const DIGESTED_FIELDS =
  "`item` (`id` and the Digest title when the entry was written), `topic` (`key` and the name when written) and `tags`";

const mergedFields = (kind: "Tag" | "Topic") =>
  `\`from\` and \`into\`, the two ${kind} names as written when the merge finished, and \`items\`, the number of Items that carried \`from\``;

const FIELDS_OF = {
  ingest: DIGESTED_FIELDS,
  digest: DIGESTED_FIELDS,
  topic: "`topic`",
  overview: "`topic`, `added` and `removed`",
  related: "`item` and `picks`",
  merge: mergedFields("Tag"),
  "merge-topic": mergedFields("Topic"),
  "vault-file-skipped": `\`path\`, a file that the Vault mirror skipped because it exceeds GitHub's ${byteSize(GITHUB_FILE_BYTES)} limit`,
  "vault-file-conflict":
    "`path`, a path in a Folder mode vault where a file that Threadsift did not write blocks the mirror",
} satisfies Readonly<Record<LogAction, string>>;

const ENTRY_FIELDS = [...Map.groupBy(LOG_ACTIONS, (action) => FIELDS_OF[action])]
  .map(
    ([fields, actions]) =>
      `${codeList(actions)} ${actions.length === 1 ? "carries" : "carry"} ${fields}.`,
  )
  .join(" ");

const listLogRoute = createRoute({
  method: "get",
  path: "/api/log",
  middleware: READER,
  description: accessNote(READER),
  request: { query: LogQuerySchema },
  responses: {
    ...accessRefusals(READER),
    200: jsonBody(
      LogPageSchema,
      `One page of the Log: at most ${String(PAGE_SIZE)} \`entries\`, newest first by \`id\`, which only grows. \`startedAt\` is when the Log began, in milliseconds. Each entry has \`id\`, \`at\` (milliseconds) and an \`action\` (${codeList(LOG_ACTIONS)}), and the rest follows the action. ${ENTRY_FIELDS} A title, name or Tag shows what the entry recorded and never changes; \`item.id\` and \`topic.key\` open the Item and the Topic page as they are now. \`next\` is the \`cursor\` of the following page, or null on the last page; send it unchanged.`,
    ),
  },
});

export function registerLogRoute(app: OpenAPIHono, ports: Ports): void {
  app.openapi(listLogRoute, async (c) => {
    const { cursor = null } = c.req.valid("query");

    return c.json(await readLog(ports.db, cursor), 200);
  });
}
