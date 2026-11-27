import { groupedNumber } from "../../src/core/contract/format.ts";
import { PASSWORD_MAX, PASSWORD_MIN } from "../../src/core/contract/passwords.ts";
import { RESET_CODE_MIN, SETUP_CODE_MIN } from "../../src/core/contract/setup-code.ts";
import { plural } from "./plural.ts";

export const SETUP = {
  codeTitle: "Step 1 of 3: enter the setup code",
  codeWhereContainer:
    'In a container, find it in the SETUP_CODE variable or the "Setup code:" log line.',
  codeWhereWorker: "On Cloudflare, find it in the Worker’s SETUP_CODE secret.",
  codeLabel: "Setup code",
  continue: "Continue",
  checking: "Checking…",
  codeWrong: "That setup code is wrong.",
  missingTitle: "No setup code set",
  missingHelp: "Run this command to add the Worker secret, then reload this page.",
  missingCommand: "wrangler secret put SETUP_CODE",
  shortTitle: "Setup code is too short",
  shortHelp: `The setup code must be at least ${SETUP_CODE_MIN} characters. Set a longer one, then reload this page.`,
  passwordTitle: "Step 2 of 3: choose a password",
  passwordHelp: `Use at least ${PASSWORD_MIN} characters. Any character is allowed.`,
  passwordTooShort: `This password is under ${PASSWORD_MIN} characters.`,
  passwordTooLong: `Your password must be ${groupedNumber(PASSWORD_MAX)} characters or fewer.`,
  passwordMismatch: "The two passwords don’t match.",
  create: "Create password",
  creating: "Creating…",
  startTitle: "Step 3 of 3: choose how to start",
  startHelp: "Your password is set.",
  startEmpty: "Start with an empty library",
  startRestore: "Restore from an export",
  startRestoreHelp:
    "Opens the Backup section of Settings to choose an export zip. A restore works only while the library is empty.",
  backToCode: "Use a different setup code",
  failed: "Couldn’t finish this step. Try again.",
} as const;

export const FIELDS = {
  password: "Password",
  confirmPassword: "Confirm password",
  showPassword: "Show password",
} as const;

export const LOGIN = {
  heading: "Sign in",
  signIn: "Sign in",
  signingIn: "Signing in…",
  wrong: "That password is wrong.",
  unreachable: "Couldn’t reach Threadsift. Try again.",
  lost: "Reset password",
  resetDone: "Your password has been reset. Sign in with the new one.",
} as const;

export const PASSWORD = {
  title: "Password",
  note: "Changing your password signs out all other browsers. This browser stays signed in. Agent tokens keep working.",
  current: "Current password",
  new: "New password",
  change: "Change password",
  changing: "Changing…",
  changed: "Password changed",
  currentWrong: "That password is wrong.",
  failed: "Couldn’t change your password. Try again.",
} as const;

export const RESET = {
  heading: "Reset password",
  intro: "Set a one-time code in this instance’s configuration, then enter it with a new password.",
  container: `For a container, set PASSWORD_RESET_CODE to a code of at least ${RESET_CODE_MIN} characters, then restart the container.`,
  worker: `On Cloudflare, run this command and enter a code of at least ${RESET_CODE_MIN} characters.`,
  generate: "Run this command to generate a random code.",
  remove: "After the reset, remove PASSWORD_RESET_CODE from this instance’s configuration.",
  workerCommand: "wrangler secret put PASSWORD_RESET_CODE",
  generateCommand: "openssl rand -base64 24",
  codeLabel: "Reset code",
  button: "Reset password",
  resetting: "Resetting…",
  back: "Back to sign in",
  codeWrong: "That reset code is wrong.",
  missing: "This instance has no reset code. Set PASSWORD_RESET_CODE first.",
  short: `This instance’s reset code is shorter than ${RESET_CODE_MIN} characters. Set a longer one.`,
  used: "That reset code was already used. Set a new one in this instance’s configuration.",
  noOwner: "This instance has no owner yet. There is no password to reset.",
  failed: "Couldn’t reset your password. Try again.",
} as const;

export const WAIT = {
  message: "Too many wrong tries. Try again in {wait}.",
  second: "1 second",
  seconds: "{count} seconds",
  minute: "1 minute",
  minutes: "{count} minutes",
  hour: "1 hour",
  hours: "{count} hours",
  over: "You can try again now.",
} as const;

export const SETTINGS = {
  title: "Settings",
  instanceSettings: "Instance settings",
  tokensTitle: "Agent tokens",
  tokensIntro:
    "Create a separate token for each program, such as the browser extension, Grok Bot or an MCP client. Tokens let programs use the library without your password, within the scopes you pick.",
  tokenName: "Token name",
  tokenNameRequired: "Enter a token name.",
  scopesLabel: "Scopes",
  scopeRead: "Read",
  scopeAdd: "Add",
  scopeDigest: "Digest",
  scopeDelete: "Delete",
  scopeReddit: "Reddit",
  scopeHintRead:
    "Read searches and opens items, topic pages, the Index, the Log, the Proposals page, the Highlights page and stored images.",
  scopeHintAdd: "Add saves one link or a batch of links.",
  scopeHintDigest:
    "Digest queues a digest or topic page overview again. With Add, a token can also send its own digest with a link.",
  scopeHintDelete: "Delete removes an item.",
  scopeHintReddit:
    "Reddit connects and disconnects your Reddit account for the browser extension. A token can never read the session back.",
  scopesRequired: "Select at least one scope.",
  scopesNone: "unreadable (no access)",
  scopesMeta: "scopes: {scopes}",
  createToken: "Create token",
  creatingToken: "Creating…",
  tokenCreateFailed: "Couldn’t create the token. Try again.",
  tokensLoadFailed: "Couldn’t load agent tokens. Reload the page to try again.",
  revealTitleNamed: "New token: {name}",
  revealPaste:
    "This token won’t be shown again. Copy it and paste it into the settings of the program that will use it.",
  tokenValue: "Token value",
  copy: "Copy",
  copied: "Copied",
  copyFailed: "The browser blocked copying. Copy the selected token from the field.",
  done: "Close",
  created: "created {when}",
  lastUsed: "last used {when}",
  neverUsed: "never used",
  revoke: "Revoke",
  revokeNamed: "Revoke {name}",
  revokeEffect:
    "The token will be deleted at once. Any program using it will lose access. This can’t be undone.",
  revokeAsk: "Revoke {name}?",
  revokeConfirm: "Revoke token",
  cancel: "Cancel",
  revokeFailed:
    "Couldn’t confirm whether {name} was revoked. Reload the page to check, or try Revoke again.",
  budgetLabel: "Daily budget",
  budgetHint:
    "New items per day, counted from 00:00 UTC. Links already in the library don’t count. Leave empty for no budget.",
  budgetInvalid: "Enter a whole number above 0, or leave the field empty.",
  budgetUsed: "Items added today (UTC): {added} of {limit}",
  budgetUsedUnlimited: "Items added today (UTC): {added}",
  budgetSpent: "This token has spent its daily budget. It can’t add new links until 00:00 UTC.",
  budgetChange: "Change budget",
  budgetChangeNamed: "Change budget for {name}",
  budgetSave: "Save budget",
  budgetSaveFailed:
    "Couldn’t confirm whether the new daily budget was saved. Reload the page to check, or try again.",
  signOut: "Sign out",
  signOutFailed:
    "Couldn’t confirm whether you’re signed out. Reload the page to check, or try again.",
} as const;

export function waitLabel(seconds: number): string {
  if (seconds < 60) {
    return plural(seconds, WAIT.second, WAIT.seconds);
  }

  if (seconds < 3600) {
    const minutes = Math.ceil(seconds / 60);

    return plural(minutes, WAIT.minute, WAIT.minutes);
  }

  const hours = Math.ceil(seconds / 3600);

  return plural(hours, WAIT.hour, WAIT.hours);
}
