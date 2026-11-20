import { z } from "zod";

const SETTING_NAMES = [
  "SETUP_CODE",
  "PASSWORD_RESET_CODE",
  "THREADSIFT_SECRET_KEY",
  "THREADSIFT_PUBLIC_ORIGIN",
  "THREADSIFT_OPENROUTER_MAX_PRICE_ZERO",
] as const;

export type SettingVariables = Readonly<
  Partial<Record<(typeof SETTING_NAMES)[number], string | undefined>>
>;

export function settingVariablesOf(source: Readonly<SettingVariables>): SettingVariables {
  return Object.fromEntries(SETTING_NAMES.map((name) => [name, unsetWhenEmpty(source[name])]));
}

export interface Settings {
  readonly setupCode: string | undefined;
  readonly resetCode: string | undefined;
  readonly publicOrigin: string | undefined;
  readonly secretKey: string | undefined;
  readonly zeroOpenRouterPrice: boolean;
}

export function unsetWhenEmpty(value: string | undefined): string | undefined {
  return value === "" ? undefined : value;
}

export function settingsOf(variables: SettingVariables): Settings {
  const zeroOpenRouterPrice =
    z
      .enum(["true", "false"])
      .default("false")
      .parse(variables.THREADSIFT_OPENROUTER_MAX_PRICE_ZERO) === "true";

  return {
    setupCode: variables.SETUP_CODE,
    resetCode: variables.PASSWORD_RESET_CODE,
    publicOrigin: variables.THREADSIFT_PUBLIC_ORIGIN,
    secretKey: variables.THREADSIFT_SECRET_KEY,
    zeroOpenRouterPrice,
  };
}
