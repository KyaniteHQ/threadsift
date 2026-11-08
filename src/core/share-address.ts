import { z } from "zod";

export const SHARE_PATH = "/share";

export const PREFILL_MAX = 1000;

const PREFILL_NOTICES = ["empty", "invalid", "private", "failed"] as const;

export type PrefillNotice = (typeof PREFILL_NOTICES)[number];

export type ShareArrival =
  | { readonly kind: "saved"; readonly id: number; readonly refreshed: boolean }
  | { readonly kind: "prefill"; readonly value: string; readonly notice: PrefillNotice | null };

const IdSchema = z
  .string()
  .regex(/^[1-9]\d{0,14}$/u)
  .transform(Number);

const AddressSchema = z.object({
  saved: IdSchema.optional(),
  refreshed: IdSchema.optional(),
  link: z.string().max(PREFILL_MAX).optional(),
  notice: z.enum(PREFILL_NOTICES).optional(),
});

export function prefillOf(value: string, notice: PrefillNotice | null): ShareArrival {
  const fits = value.length <= PREFILL_MAX;

  return {
    kind: "prefill",
    value: fits ? value : value.slice(0, PREFILL_MAX).toWellFormed(),
    notice: fits ? notice : (notice ?? "invalid"),
  };
}

export function shareAddress(arrival: Readonly<ShareArrival>): string {
  const query = new URLSearchParams();

  if (arrival.kind === "saved") {
    query.set(arrival.refreshed ? "refreshed" : "saved", String(arrival.id));
  } else {
    if (arrival.value !== "") {
      query.set("link", arrival.value);
    }

    if (arrival.notice !== null) {
      query.set("notice", arrival.notice);
    }
  }

  return `/?${query.toString()}`;
}

export function arrivalOf(search: string): ShareArrival | null {
  const parsed = AddressSchema.safeParse(Object.fromEntries(new URLSearchParams(search)));

  if (!parsed.success) {
    return null;
  }

  const { saved, refreshed, link, notice } = parsed.data;

  if (saved !== undefined) {
    return { kind: "saved", id: saved, refreshed: false };
  }

  if (refreshed !== undefined) {
    return { kind: "saved", id: refreshed, refreshed: true };
  }

  return link === undefined && notice === undefined
    ? null
    : { kind: "prefill", value: link ?? "", notice: notice ?? null };
}
