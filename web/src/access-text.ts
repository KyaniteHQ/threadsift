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
  passwordTooShort: `Your password must be at least ${PASSWORD_MIN} characters.`,
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
  note: "Changing your password ends every other browser’s session, and agent tokens keep working.",
  current: "Current password",
  new: "New password",
  change: "Change password",
  changing: "Changing…",
  changed: "Your password is changed.",
  currentWrong: "That current password is wrong.",
  failed: "Couldn’t change your password, so try again.",
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
    "Give the Extension, Grok Bot and each MCP client their own token to save links, and pick what each token can do.",
  tokenName: "Token name",
  tokenNameRequired: "Enter a token name first.",
  scopesLabel: "Scopes",
  scopeRead: "Read",
  scopeAdd: "Add",
  scopeDigest: "Digest",
  scopeDelete: "Delete",
  scopeReddit: "Reddit",
  scopesHint:
    "Read searches and opens Items, Topic pages, the Index, the Log, the Proposals, the Highlights page and stored images. Add saves a link or a batch. Digest queues a Digest or Topic page overview again, or sends a Digest with a link. Delete deletes an Item. Reddit connects and disconnects your Reddit account for the Extension, and can never read the session back.",
  scopesRequired: "Select at least one scope first.",
  scopeNameRead: "read",
  scopeNameAdd: "add",
  scopeNameDigest: "digest",
  scopeNameDelete: "delete",
  scopeNameReddit: "reddit",
  scopesNone: "none can be read",
  scopesMeta: "scopes: {scopes}",
  createToken: "Create token",
  creatingToken: "Creating…",
  tokenCreateFailed: "Couldn’t create the token, so try again.",
  tokensLoadFailed: "Couldn’t load agent tokens.",
  revealTitleNamed: "New token for {name}",
  revealPaste: "This token is shown once, so copy it now and paste it into that agent’s settings.",
  tokenValue: "Token value",
  copy: "Copy",
  copied: "Copied",
  copyFailed: "Couldn’t copy the token, so select it and copy it by hand.",
  done: "Done",
  created: "created {when}",
  lastUsed: "last used {when}",
  neverUsed: "never used",
  revoke: "Revoke",
  revokeNamed: "Revoke {name}",
  revokeEffect: "The agent that uses this token stops working at once.",
  revokeAsk: "Revoke {name}?",
  revokeConfirm: "Revoke token",
  cancel: "Cancel",
  revokeFailed: "Couldn’t revoke this token, so try again.",
  budgetLabel: "Daily budget",
  budgetHint: "Items per day, counted from 00:00 UTC. Leave empty for no budget.",
  budgetInvalid: "Enter a whole number above 0, or leave empty.",
  budgetUsed: "{added} of {limit} Items added today",
  budgetUsedUnlimited: "{added} Items added today",
  budgetSpent: "Spent until 00:00 UTC",
  budgetChange: "Change budget",
  budgetChangeNamed: "Change budget for {name}",
  budgetSave: "Save budget",
  budgetSaveFailed: "Couldn’t save the budget, so try again.",
  signOutTitle: "Sign out",
  signOutNote: "Signing out ends only this browser’s session, and agent tokens keep working.",
  signOut: "Sign out",
  signOutFailed: "Couldn’t sign out and you’re still signed in, so try again.",
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
