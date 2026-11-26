import { promises as fs } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { z } from "zod";

import { parsedJson } from "../src/core/kernel/parsed-json.ts";
import { balanceOf, readingOf } from "./x-api-probe-count.ts";
import type { Config } from "./x-api-probe-input.ts";
import {
  BALANCE_SETTLE_MS,
  type PlannedRequest,
  isBalanceRead,
  recordNameOf,
} from "./x-api-probe-plan.ts";
import { type Sent, printSent, redacted } from "./x-api-probe-report.ts";
import { sentOnce } from "./x-api-probe-send.ts";

export type Run = { readonly config: Config; readonly folder: string; readonly token: string };

export async function writeRecord(run: Run, name: string, json: string): Promise<void> {
  await fs.writeFile(join(run.folder, name), `${redacted(json, run.token)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
}

export async function step(run: Run, index: number, request: PlannedRequest): Promise<Sent> {
  if (request.settleFirst) await sleep(BALANCE_SETTLE_MS);
  const answer = await sentOnce(request, run.token);
  const reading = answer.kind === "answer" ? readingOf(request.role, answer.text) : null;
  const sent: Sent = {
    request,
    outcome:
      answer.kind === "answer"
        ? { kind: "answer", status: answer.status }
        : { kind: "no-answer", errorClass: answer.errorClass },
    reading,
    charged:
      reading?.kind === "counted" &&
      (request.role === "lookup" || (answer.kind === "answer" && answer.status === 200))
        ? reading.counts
        : request.worst,
    balanceMicros:
      answer.kind === "answer" && isBalanceRead(request)
        ? balanceOf(answer.status, answer.text)
        : null,
  };
  const record = {
    request: { method: "GET", path: request.path, query: request.query },
    sentAt: new Date().toISOString(),
    answer:
      answer.kind === "answer"
        ? {
            status: answer.status,
            headers: answer.headers,
            body: parsedJson(z.json(), answer.text) ?? answer.text,
          }
        : answer,
    counts: reading?.kind === "counted" ? reading.counts : null,
  };

  await writeRecord(run, recordNameOf(index, request), JSON.stringify(record, null, 2));
  printSent(run.config.input.probe, index, sent);
  return sent;
}
