import { createRoute, z } from "@hono/zod-openapi";

import { byteSize } from "../core/contract/format.ts";
import { MAX_ROW_BYTES } from "../core/contract/limits.ts";
import { IntakeAnswerSchema } from "../core/contract/x-intake-contract.ts";
import { ITEM_CAP, access, tooLarge } from "./access.ts";
import { countedRefusals } from "./intake-body.ts";
import { jsonBody, jsonRequest, noContent } from "./openapi.ts";
import { ErrorResponseSchema } from "./schemas.ts";
import { CREDENTIAL_REFUSALS, UNSUPPORTED_TASK } from "./task-credential.ts";

export const intakeRoute = createRoute({
  method: "post",
  path: "/api/ai-tasks/{id}/intake",
  middleware: [access("callback", { body: ITEM_CAP }), countedRefusals] as const,
  request: {
    params: z.object({ id: z.string() }),
    body: jsonRequest(IntakeAnswerSchema),
  },
  responses: {
    204: noContent(
      `With \`content\`, the X thread is stored for the task's Item without being shown, the Digest (when the body holds one) is kept for the Item's Digest job, the task is done and the Item's fetch job is closed. A verification job then checks every post of the thread against X's own embed answer and shows only what X confirms; a thread whose post X does not confirm, or that X cannot confirm after the job's retries, ends the Item with the fetch result \`unreadable\`, which keeps the saved copy of an Item that had one and leaves a new Item without content. The thread is limited to ${byteSize(MAX_ROW_BYTES)} of JSON, as for any other row. With \`unavailable\`, the task is done, the fetch job is closed and the Item stays a Link-only Item. A second call lands on 409.`,
    ),
    400: jsonBody(
      ErrorResponseSchema,
      `The task is not an X link task (\`${UNSUPPORTED_TASK}\`); the body is neither \`{ "content": <text>, "digest"?: <Digest> }\` nor \`{ "unavailable": true }\`; or \`content\` is not an X thread JSON text of the task's post, with the reasons in \`error\`. The task stays open, so the bot can answer again. The second refusal of one send moves the task's deadline to now, so the same deadline transition runs: the task fails as a timeout and the next send follows at the job's retry delay.`,
    ),
    ...CREDENTIAL_REFUSALS,
    409: jsonBody(
      ErrorResponseSchema,
      "The task is not running, is past its deadline, or already holds an answer, or the Item's content changed or its fetch job closed since the task was sent. Nothing is published. In the last case the task fails and its fetch job is due again. A repeated call lands here, so the bot treats 409 as done.",
    ),
    413: jsonBody(ErrorResponseSchema, `${tooLarge(ITEM_CAP)}. Nothing changes.`),
  },
});
