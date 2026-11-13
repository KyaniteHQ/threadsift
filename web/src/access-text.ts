import { groupedNumber } from "../../src/core/format.ts";
import { PASSWORD_MAX, PASSWORD_MIN } from "../../src/core/passwords.ts";
import { RESET_CODE_MIN, SETUP_CODE_MIN } from "../../src/core/setup-code.ts";
import { filled } from "./text.ts";

export const SETUP = {
  stepOne: "Step 1 of 2",
  stepTwo: "Step 2 of 2",
  codeTitle: "Enter the setup code",
  codeWhereContainer:
    'Find it in the container’s SETUP_CODE variable or the "Setup code:" log line.',
  codeWhereWorker: "On Cloudflare, find it in the Worker’s SETUP_CODE secret.",
  codeLabel: "Setup code",
  continue: "Continue",
  checking: "Checking…",
  codeWrong: "That setup code is wrong.",
  missingTitle: "No setup code set",
  missingHelp:
    "This Instance has no setup code. Add one as a Worker secret with the command below, then reload this page.",
  missingCommand: "wrangler secret put SETUP_CODE",
  shortTitle: "Setup code is too short",
  shortHelp: `Threadsift doesn’t use a setup code shorter than ${SETUP_CODE_MIN} characters. Set a longer one and reload this page.`,
  passwordTitle: "Choose a password",
  passwordHelp: `At least ${PASSWORD_MIN} characters, any characters allowed.`,
  passwordTooShort: `Passwords must be at least ${PASSWORD_MIN} characters.`,
  passwordTooLong: `Passwords must be at most ${groupedNumber(PASSWORD_MAX)} characters.`,
  passwordMismatch: "The two passwords don’t match.",
  create: "Create password",
  creating: "Creating…",
  backToCode: "Change setup code",
  failed: "Couldn’t finish setup, so try again.",
} as const;

export const FIELDS = {
  password: "Password",
  confirmPassword: "Confirm password",
  showPassword: "Show password",
} as const;

export const LOGIN = {
  heading: "Open your library",
  signIn: "Sign in",
  signingIn: "Signing in…",
  wrong: "That password is wrong.",
  unreachable: "Couldn’t reach Threadsift, so try again.",
  lost: "Lost your password?",
  resetDone: "Your password is reset, and you can sign in with the new one.",
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
  heading: "Lost your password?",
  intro:
    "Threadsift can reset your password with a one-time code that you put on the server yourself.",
  container: `In a container install, set PASSWORD_RESET_CODE to a code of at least ${RESET_CODE_MIN} characters and restart the container.`,
  worker: `On Cloudflare, run the command below and enter a code of at least ${RESET_CODE_MIN} characters.`,
  generate: "To make a code, run the command below.",
  remove: "After the reset, remove PASSWORD_RESET_CODE from the server.",
  workerCommand: "wrangler secret put PASSWORD_RESET_CODE",
  generateCommand: "openssl rand -base64 24",
  codeLabel: "Reset code",
  button: "Reset password",
  resetting: "Resetting…",
  back: "Back to sign in",
  codeWrong: "That reset code is wrong.",
  missing: "This server has no reset code, so set PASSWORD_RESET_CODE first.",
  short: `The server’s reset code is shorter than ${RESET_CODE_MIN} characters, so Threadsift does not use it.`,
  used: "This reset code was already used, so set a new one on the server.",
  noOwner: "There is no owner on this Instance yet, so there is no password to reset.",
  failed: "Couldn’t reset your password, so try again.",
} as const;

export const WAIT = {
  message: "Too many wrong tries, so wait {wait} before trying again.",
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
    return seconds === 1 ? WAIT.second : filled(WAIT.seconds, { count: String(seconds) });
  }

  if (seconds < 3600) {
    const minutes = Math.ceil(seconds / 60);

    return minutes === 1 ? WAIT.minute : filled(WAIT.minutes, { count: String(minutes) });
  }

  const hours = Math.ceil(seconds / 3600);

  return hours === 1 ? WAIT.hour : filled(WAIT.hours, { count: String(hours) });
}
