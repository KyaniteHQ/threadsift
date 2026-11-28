import type { BotState } from "../../src/core/contract/bot-install-contract.ts";

export const BOT_UPDATE_TEXT = {
  sectionTitle: "Threadsift bot",
  intro:
    "Check the bot’s version against the expected release and choose whether it installs updates by itself.",
  versionLabel: "Bot version",
  expectedLabel: "Expected release",
  reportedLabel: "Last reported",
  unreported: "Not reported yet",
  installLabel: "Install bot updates",
  installOn: "Automatically",
  installOff: "When asked",
  helpOn:
    "The bot installs a newer expected release once the file hashes match, and never moves back to an older release or changes its routines.",
  helpOff: "Say “update threadsift” in the bot’s chat to install the expected release.",
  stateUnreported:
    "The bot hasn’t reported its version yet. A bot installed before bot-v14 never reports, so say “update threadsift” once in its chat.",
  stateCurrent: "The bot runs the release this instance expects.",
  stateWaitsOn: "An update is waiting. The bot installs it on its next task or routine run.",
  stateWaitsOff:
    "An update is waiting, and automatic install is off. Say “update threadsift” in the bot’s chat, or choose Automatically.",
  stateAhead:
    "The bot runs a newer release than this instance expects, so it installs nothing and keeps its version. To move it back, say “update threadsift” in the bot’s chat.",
  stateSkillWaits:
    "The bot installed the files for the expected release. It saves the new skill the next time you send a Threadsift request in its chat.",
  stateRefusedOn:
    "The downloaded files didn’t match the hashes this instance expects, so the bot installed nothing and told you once in its chat. It tries again on later runs.",
  stateRefusedOff:
    "The downloaded files didn’t match the hashes this instance expects, so the bot installed nothing and told you once in its chat. Automatic install is off, so it tries again when you say “update threadsift”.",
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
    case "ahead":
      return BOT_UPDATE_TEXT.stateAhead;
    case "refused":
      return autoInstall ? BOT_UPDATE_TEXT.stateRefusedOn : BOT_UPDATE_TEXT.stateRefusedOff;
    default: {
      const exhaustive: never = bot;

      return exhaustive;
    }
  }
}
