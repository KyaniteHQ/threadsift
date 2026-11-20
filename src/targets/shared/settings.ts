import { z } from "zod";

export type SettingVariables = Readonly<
  Partial<
    Record<
      | "SETUP_CODE"
      | "PASSWORD_RESET_CODE"
      | "THREADSIFT_SECRET_KEY"
      | "THREADSIFT_PUBLIC_ORIGIN"
      | "THREADSIFT_OPENROUTER_MAX_PRICE_ZERO",
      string | undefined
    >
  >
>;

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
    setupCode: unsetWhenEmpty(variables.SETUP_CODE),
    resetCode: unsetWhenEmpty(variables.PASSWORD_RESET_CODE),
    publicOrigin: unsetWhenEmpty(variables.THREADSIFT_PUBLIC_ORIGIN),
    secretKey: variables.THREADSIFT_SECRET_KEY,
    zeroOpenRouterPrice,
  };
}
