import type { GrokBotResult } from "../../src/core/grok-bot-contract.ts";
import { AI_TEXT } from "./ai-text.ts";

export const GROK_BOT_TEXT = {
  sectionTitle: "Grok Bot",
  intro: "Connect your Grok Bot once here. Save sends the bot nothing.",
  tokenPointer:
    "The bot’s chat skills need a token made in Agent tokens below, which the bot keeps.",
  addressLabel: "Webhook address",
  addressHelp:
    "Copy it from the routine’s panel in your Grok Bot; use a public https address and keep it private.",
  addressPlaceholder: "https://…",
  keyLabel: "Routine key",
  keyHelp:
    "The key takes printable ASCII characters only (letters, digits and punctuation) and is kept sealed on this Instance, sent only to that address and never shown again.",
  keySavedPlaceholder: "Key saved",
  keyNewAddress: "Enter the key again for the new address.",
  stateNone: "No Grok Bot is set up on this Instance.",
  stateSaved: "A Grok Bot address and key are saved on this Instance.",
  stateUnreadable:
    "This Instance can no longer open the saved key, so save the address with a new key or remove it.",
  save: "Save",
  saving: "Saving…",
  saved: "Grok Bot saved.",
  test: "Test",
  testing: "Testing…",
  testCost:
    "Test sends one harmless ping to the saved address with no library text, wakes the routine and costs the bot one run.",
  remove: "Remove",
  removing: "Removing…",
  removed: "Grok Bot removed.",
  invalidAddress: "Enter a public https address with no username, password, query or fragment.",
  invalidKey:
    "Enter a key up to 4,096 characters: letters, digits and punctuation only, no spaces or line breaks, and no accented or other non-ASCII characters.",
  keyNeeded: "Enter a key to save this address.",
  resultOk: "The Grok Bot answered and its routine woke.",
  resultWrongKey: "The Grok Bot refused the key. Enter the key again and save.",
  resultNotFound: "The Grok Bot has no routine at that address. Check the address and save again.",
  resultBotError: "The Grok Bot answered with an error. Try Test again later.",
  resultUnreachable: "The Grok Bot did not answer. Check the address and connection.",
  resultTimeout: "The Grok Bot did not answer in 8 seconds. Try again.",
  resultRefused:
    "Threadsift will not send to this address, which must be public https. Save a different one.",
  resultNotConfigured: "Save an address and key first, then press Test.",
  loadFailed: "Couldn’t load the Grok Bot settings. Reload the page.",
  failed: "Couldn’t save, remove or test the Grok Bot. Try again.",
} as const;

export const KEY_STATES = {
  none: GROK_BOT_TEXT.stateNone,
  usable: GROK_BOT_TEXT.stateSaved,
  unreadable: GROK_BOT_TEXT.stateUnreadable,
  missing: AI_TEXT["secret-missing"],
} as const;

export function resultText(result: GrokBotResult): string {
  switch (result) {
    case "ok":
      return GROK_BOT_TEXT.resultOk;
    case "wrong-key":
      return GROK_BOT_TEXT.resultWrongKey;
    case "not-found":
      return GROK_BOT_TEXT.resultNotFound;
    case "bot-error":
      return GROK_BOT_TEXT.resultBotError;
    case "unreachable":
      return GROK_BOT_TEXT.resultUnreachable;
    case "timeout":
      return GROK_BOT_TEXT.resultTimeout;
    case "refused":
      return GROK_BOT_TEXT.resultRefused;
    case "not-configured":
      return GROK_BOT_TEXT.resultNotConfigured;
    case "secret-missing":
      return AI_TEXT["secret-missing"];
    default: {
      const exhaustive: never = result;

      return exhaustive;
    }
  }
}
