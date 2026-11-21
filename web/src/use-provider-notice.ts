import { type CliProvider, isCliProvider } from "../../src/core/contract/provider-families.ts";
import { type AiView, fetchAiSettings } from "./ai-api.ts";
import { useRead } from "./use-read.ts";

export type ProviderNotice =
  | { readonly kind: "none" | "missing" }
  | { readonly kind: "plan"; readonly provider: CliProvider };

const NONE: ProviderNotice = { kind: "none" };

function noticeOf(settings: AiView["settings"]): ProviderNotice {
  if (settings === null) return { kind: "missing" };

  return isCliProvider(settings.provider) ? { kind: "plan", provider: settings.provider } : NONE;
}

async function readNotice(signal: AbortSignal): Promise<ProviderNotice> {
  const { settings } = await fetchAiSettings(signal);

  return noticeOf(settings);
}

export function useProviderNotice(): ProviderNotice {
  return useRead(readNotice, NONE, NONE);
}
