import { eq } from "drizzle-orm";

import type {
  BotInstallAnswer,
  BotInstallReport,
  BotRelease,
  BotState,
  BotUpdateView,
} from "../../../core/contract/bot-install-contract.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import { AUTO_INSTALL_DEFAULT, threadsiftBot } from "../../../core/kernel/schema.ts";
import { EXPECTED_BOT_RELEASE } from "./expected-bot-release.ts";

type BotInstallPorts = Pick<Ports, "db">;

type BotRow = typeof threadsiftBot.$inferSelect;

const EXPECTED: BotRelease = EXPECTED_BOT_RELEASE;

function releaseNumber(tag: string): number {
  return Number(tag.slice("bot-v".length));
}

function stateOf(expected: string, row: Readonly<BotRow> | undefined): BotState {
  if (
    row === undefined ||
    row.version === null ||
    row.skillVersion === null ||
    row.reportedAt === null
  ) {
    return { state: "unreported" };
  }

  const { version, skillVersion: skill, reportedAt } = row;

  if (version === expected) {
    return skill === expected
      ? { state: "current", version, reportedAt }
      : { state: "skill-waits", version, reportedAt, skill };
  }

  if (row.refused === expected) {
    return { state: "refused", version, reportedAt };
  }

  return releaseNumber(version) > releaseNumber(expected)
    ? { state: "ahead", version, reportedAt }
    : { state: "waits", version, reportedAt };
}

function viewOf(row: Readonly<BotRow> | undefined): BotUpdateView {
  return {
    expected: EXPECTED.tag,
    autoInstall: row?.autoInstall ?? AUTO_INSTALL_DEFAULT,
    bot: stateOf(EXPECTED.tag, row),
  };
}

export async function readBotUpdate({ db }: Readonly<BotInstallPorts>): Promise<BotUpdateView> {
  const [row] = await db.select().from(threadsiftBot).where(eq(threadsiftBot.id, 1));

  return viewOf(row);
}

export async function saveBotUpdate(
  { db }: Readonly<BotInstallPorts>,
  autoInstall: boolean,
): Promise<BotUpdateView> {
  const [row] = await db
    .insert(threadsiftBot)
    .values({ id: 1, autoInstall })
    .onConflictDoUpdate({ target: threadsiftBot.id, set: { autoInstall } })
    .returning();

  return viewOf(row);
}

export async function reportBotInstall(
  { db }: Readonly<BotInstallPorts>,
  { version, skill, refused }: Readonly<BotInstallReport>,
  reporter: { readonly tokenId: number; readonly at: number },
): Promise<BotInstallAnswer> {
  const reported = {
    version,
    skillVersion: skill,
    refused,
    reportedAt: reporter.at,
    reportedBy: reporter.tokenId,
  };

  const [row] = await db
    .insert(threadsiftBot)
    .values({ id: 1, ...reported })
    .onConflictDoUpdate({ target: threadsiftBot.id, set: reported })
    .returning({ autoInstall: threadsiftBot.autoInstall });

  return { expected: EXPECTED, autoInstall: row?.autoInstall ?? AUTO_INSTALL_DEFAULT };
}
