import type { BotState } from "../../src/core/contract/bot-install-contract.ts";

export const BOT_UPDATE_TEXT = {
  sectionTitle: "Threadsift bot",
  intro:
    "Check the bot’s version against the expected release and choose whether it installs updates by itself.",
  versionLabel: "Bot version",
  expectedLabel: "Expected release",
  unreported: "Not reported yet",
  installLabel: "Install bot updates",
  installOn: "Automatically",
  installOff: "When asked",
  helpOn:
    "When an update is waiting, the bot checks the file hashes and installs the expected release at its next task or routine run without changing its routines.",
  helpOff: "Say “update threadsift” in the bot’s chat to install the expected release.",
  stateUnreported:
    "The bot hasn’t reported its version yet. It reports at the start of each task or routine run, and after it installs a release.",
  stateCurrent: "The bot runs the release this instance expects.",
  stateWaitsOn: "An update is waiting. The bot installs it at its next task or routine run.",
  stateWaitsOff:
    "An update is waiting, and automatic updates are off. Say “update threadsift” in the bot’s chat, or choose Automatically.",
  stateSkillWaits:
    "The bot installed the files for the expected release. Its skill updates on your next message to the bot.",
  stateRefused:
    "The bot installed nothing because the downloaded files for the release didn’t match the hashes this instance expects. It sent one message in its chat and tries again on later runs.",
  saving: "Saving…",
  saveFailed: "Couldn’t save the update setting. Try again.",
  loadFailed: "Couldn’t load the Threadsift bot settings. Reload the page.",
} as const;

export function botStateText(bot: BotState, autoInstall: boolean): string {
  switch (bot.state) {
    case "unreported":
      return BOT_UPDATE_TEXT.stateUnreported;
    case "current":
      return BOT_UPDATE_TEXT.stateCurrent;
    case "waits":
      return autoInstall ? BOT_UPDATE_TEXT.stateWaitsOn : BOT_UPDATE_TEXT.stateWaitsOff;
    case "skill-waits":
      return BOT_UPDATE_TEXT.stateSkillWaits;
    case "refused":
      return BOT_UPDATE_TEXT.stateRefused;
    default: {
      const exhaustive: never = bot;

      return exhaustive;
    }
  }
}
