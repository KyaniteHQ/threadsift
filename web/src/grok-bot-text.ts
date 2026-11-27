import { groupedNumber } from "../../src/core/contract/format.ts";
import { GROK_BOT_IN_USE, type GrokBotResult } from "../../src/core/contract/grok-bot-contract.ts";
import { HOP_DEADLINE_MS } from "../../src/core/contract/request-waits.ts";
import { SECRET_INPUT_MAX } from "../../src/core/contract/secret-input.ts";
import { SECOND_MS } from "../../src/core/contract/time-units.ts";
import { AI_TEXT } from "./ai-text.ts";

export const GROK_BOT_TEXT = {
  sectionTitle: "Grok Bot",
  intro: "Connect your Grok Bot once. Saving sends nothing to the bot.",
  xLinks:
    "When the X posts section allows it, Threadsift sends pasted X links to the saved Grok Bot so each item gets the post text, replies and a digest. Without a way to read X links, each becomes a link-only item, saved without the post’s content.",
  tokenPointer:
    "The bot’s chat skills need an agent token with the Read and Add scopes. Make one in the Agent tokens section and give it to the bot to keep.",
  addressLabel: "Webhook address",
  addressHelp:
    "Copy it from the routine’s panel in Grok. Use a public https address. Keep it private because it reaches the bot.",
  addressPlaceholder: "https://…",
  keyLabel: "Routine key",
  keyHelp:
    "The key takes ASCII letters, digits and punctuation only. Threadsift keeps it sealed on this instance, sends it only to the saved address and never shows it again.",
  keySavedPlaceholder: "Key saved",
  keyNewAddress: "Enter the key again for the new address.",
  stateNone: "No Grok Bot is set up on this instance.",
  stateSaved: "A Grok Bot address and key are saved on this instance.",
  stateUnreadable:
    "This instance can no longer open the saved key. Save the address again with a new key, or remove the bot.",
  save: "Save",
  saving: "Saving…",
  saved: "Grok Bot saved",
  test: "Test",
  testing: "Testing…",
  testCost:
    "Test sends one harmless ping to the saved address, with no text from the library. It wakes the routine and uses one run of the bot.",
  remove: "Remove",
  removing: "Removing…",
  removed: "Grok Bot removed",
  removeNothing: "Nothing is saved.",
  removeInUse: GROK_BOT_IN_USE,
  invalidAddress: "Enter a public https address with no username, password, query or fragment.",
  invalidKey: `Enter a key of at most ${groupedNumber(SECRET_INPUT_MAX)} characters, using letters, digits and punctuation only. Spaces, line breaks, and accented or other non-ASCII characters aren’t allowed.`,
  keyNeeded: "Enter a key to save this address.",
  resultOk: "The Grok Bot answered and its routine woke.",
  resultWrongKey:
    "The Grok Bot rejected the ping. The key or address may be wrong. Copy both from the routine’s panel and save again.",
  resultNotFound: "The Grok Bot has no routine at that address. Check the address and save again.",
  resultBotError: "The Grok Bot answered with an error. Try again later.",
  resultUnreachable: "The Grok Bot didn’t answer. Check the address and the network connection.",
  resultTimeout: `The Grok Bot didn’t answer within ${String(HOP_DEADLINE_MS / SECOND_MS)} seconds. Try again.`,
  resultRefused:
    "Threadsift won’t send to this address. It must be a public https address. Save a different one.",
  resultNotConfigured: "Save an address and key first.",
  loadFailed: "Couldn’t load the Grok Bot settings. Reload the page.",
  failed: "Couldn’t reach this instance or read its reply. Try again.",
} as const;

export const KEY_STATES = {
  none: GROK_BOT_TEXT.stateNone,
  usable: GROK_BOT_TEXT.stateSaved,
  unreadable: GROK_BOT_TEXT.stateUnreadable,
  missing: AI_TEXT["secret-missing"],
} as const;

export const RESULT_TEXT = {
  ok: GROK_BOT_TEXT.resultOk,
  "wrong-key": GROK_BOT_TEXT.resultWrongKey,
  "not-found": GROK_BOT_TEXT.resultNotFound,
  "bot-error": GROK_BOT_TEXT.resultBotError,
  unreachable: GROK_BOT_TEXT.resultUnreachable,
  timeout: GROK_BOT_TEXT.resultTimeout,
  refused: GROK_BOT_TEXT.resultRefused,
  "not-configured": GROK_BOT_TEXT.resultNotConfigured,
  "secret-missing": AI_TEXT["secret-missing"],
} as const satisfies Record<GrokBotResult, string>;
