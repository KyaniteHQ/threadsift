import { fillChecks } from "./fill-checks.ts";
import { limitChecks } from "./limit-checks.ts";
import { noExtensionCheck } from "./no-extension-check.ts";
import { relayChecks } from "./relay-checks.ts";
import type { Run } from "./run-types.ts";
import { readStorage, secretScan } from "./secret-scan.ts";

export const GROUPS = ["limit", "fill", "relay", "no-extension"] as const;

export type Group = (typeof GROUPS)[number];

export async function runChecks(run: Readonly<Run>, selected: readonly Group[]): Promise<void> {
  const wants = (group: Group): boolean => selected.length === 0 || selected.includes(group);

  if (wants("limit")) await limitChecks(run);

  if (wants("fill")) await fillChecks(run);

  if (wants("relay")) await relayChecks(run);

  const storage = await readStorage(run);

  if (wants("no-extension")) await noExtensionCheck(run);

  await secretScan(run, storage);
}
