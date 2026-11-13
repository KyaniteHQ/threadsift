import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { KIND_CASES } from "./bot-kinds-cases.ts";
import { type Sent, botInstance, openJobOf, sentTask } from "./bot-kinds-fixtures.ts";
import { answered } from "./bot-task-http.ts";
import { taskRow } from "./bot-task-rows.ts";
import type { Instance } from "./instance.ts";
import { rows } from "./related-fixtures.ts";

const WEEKLY = new Set(["proposals", "topic_proposals"]);

function numberOf(
  instance: Instance,
  query: string,
  ...params: readonly number[]
): number | undefined {
  return rows(instance, z.object({ n: z.number() }), query, ...params)[0]?.n;
}

describe("a bot task of each kind stores the context its answer is checked and applied from", () => {
  for (const kindCase of KIND_CASES) {
    describe(kindCase.kind, () => {
      let instance: Instance;
      let sent: Sent;

      before(async () => {
        instance = await botInstance();

        const owner = await kindCase.library(instance);

        sent = await sentTask(
          instance,
          kindCase.kind,
          await openJobOf(instance, { kind: kindCase.kind, itemId: owner }),
        );
      });

      after(() => instance.close());

      if (WEEKLY.has(kindCase.kind)) {
        it("records the catalog revision the pairs were read under", () => {
          assert.equal(
            numberOf(instance, "select input_revision as n from ai_tasks where id = ?", sent.id),
            numberOf(instance, "select version as n from catalog_version where id = 1"),
          );
        });
      }

      it("refuses a result that breaks a rule of the kind with 400 and leaves the task open, then takes a fitting one", async () => {
        const who = { id: sent.id, token: sent.token };

        const refused = await answered(instance, who, {
          result: kindCase.breaks.result(sent.context),
        });

        const open = taskRow(instance, sent.id);

        assert.equal(refused.status, 400);
        assert.match(refused.text, kindCase.breaks.reason);
        assert.deepEqual([open.state, open.answered_at, open.result], ["running", null, null]);

        const accepted = await answered(instance, who, { result: kindCase.fits(sent.context) });

        assert.equal(accepted.status, 204);
        assert.notEqual(taskRow(instance, sent.id).answered_at, null);
      });
    });
  }
});
