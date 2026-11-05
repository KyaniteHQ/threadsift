import { groupedNumber } from "../../src/core/format.ts";
import { PASSWORD_MAX, PASSWORD_MIN } from "../../src/core/passwords.ts";
import { SETUP_CODE_MIN } from "../../src/core/setup-code.ts";

export const TITLES = {
  setup: "Set up Threadsift",
  login: "Sign in to Threadsift",
  settings: "Settings, Threadsift",
  library: "Threadsift",
  loading: "Threadsift",
  unreachable: "Threadsift",
} as const;

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
  back: "Back to library",
  instanceSettings: "Instance settings",
  tokensTitle: "Agent tokens",
  tokensIntro: "Give the Extension, Grok Bot and each MCP client their own token to save links.",
  tokenName: "Token name",
  tokenNameRequired: "Enter a token name first.",
  createToken: "Create token",
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
  signOutTitle: "Sign out",
  signOutNote: "Signing out ends only this browser’s session, and agent tokens keep working.",
  signOut: "Sign out",
  signOutFailed: "Couldn’t sign out and you’re still signed in, so try again.",
} as const;

export function filled(template: string, values: Readonly<Record<string, string>>): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, value),
    template,
  );
}

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
