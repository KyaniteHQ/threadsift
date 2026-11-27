import { eq } from "drizzle-orm";

import type {
  BotInstallReport,
  BotRelease,
  BotState,
  BotUpdateView,
} from "../../../core/contract/bot-install-contract.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import { threadsiftBot } from "../../../core/kernel/schema.ts";
import { EXPECTED_BOT_RELEASE } from "./expected-bot-release.ts";

type BotInstallPorts = Pick<Ports, "db">;

type BotRow = typeof threadsiftBot.$inferSelect;

const EXPECTED: BotRelease = EXPECTED_BOT_RELEASE;

async function rowOf({ db }: Readonly<BotInstallPorts>): Promise<BotRow | undefined> {
  const [row] = await db.select().from(threadsiftBot).where(eq(threadsiftBot.id, 1));

  return row;
}

function stateOf(expected: string, row: Readonly<BotRow> | undefined): BotState {
  if (row === undefined || row.version === null || row.skillVersion === null) {
    return { state: "unreported" };
  }

  const { version, skillVersion: skill } = row;

  if (version === expected) {
    return skill === expected
      ? { state: "current", version }
      : { state: "skill-waits", version, skill };
  }

  return row.refused === expected ? { state: "refused", version } : { state: "waits", version };
}

function viewOf(row: Readonly<BotRow> | undefined): BotUpdateView {
  return {
    expected: EXPECTED.tag,
    autoInstall: row?.autoInstall ?? true,
    bot: stateOf(EXPECTED.tag, row),
  };
}

export async function readBotUpdate(ports: Readonly<BotInstallPorts>): Promise<BotUpdateView> {
  return viewOf(await rowOf(ports));
}

export async function saveBotUpdate(
  ports: Readonly<BotInstallPorts>,
  autoInstall: boolean,
): Promise<BotUpdateView> {
  await ports.db
    .insert(threadsiftBot)
    .values({ id: 1, autoInstall })
    .onConflictDoUpdate({ target: threadsiftBot.id, set: { autoInstall } });

  return readBotUpdate(ports);
}

export async function reportBotInstall(
  ports: Readonly<BotInstallPorts>,
  { version, skill, refused }: Readonly<BotInstallReport>,
): Promise<{ readonly expected: BotRelease; readonly autoInstall: boolean }> {
  const reported = { version, skillVersion: skill, refused };

  await ports.db
    .insert(threadsiftBot)
    .values({ id: 1, ...reported })
    .onConflictDoUpdate({ target: threadsiftBot.id, set: reported });

  return { expected: EXPECTED, autoInstall: viewOf(await rowOf(ports)).autoInstall };
}
