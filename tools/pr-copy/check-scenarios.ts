import { cpuCheck } from "./check-cpu.ts";
import { cronCheck } from "./check-cron.ts";
import { capCheck, queueCheck, unreachableCheck } from "./check-fetch.ts";
import type { Run } from "./check-run.ts";
import type { Findings, ScenarioName } from "./check-types.ts";
import type { Copy } from "./copy-client.ts";

export type Body = (
  run: Readonly<Run>,
  copy: Readonly<Copy>,
  findings: Readonly<Findings>,
) => Promise<void>;

export const ORDER = ["queue", "cap", "cpu", "unreachable", "cron"] as const;

export const BODIES: Readonly<Record<Exclude<ScenarioName, "login">, Body>> = {
  queue: queueCheck,
  cap: capCheck,
  cpu: cpuCheck,
  unreachable: unreachableCheck,
  cron: cronCheck,
};
