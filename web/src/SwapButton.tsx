import type { MouseEventHandler } from "react";

import { Icon } from "./Icon.tsx";

export function SwapButton({
  label,
  busyLabel,
  busy,
  blocked = false,
  type = "submit",
  onClick,
  secondary = false,
}: Readonly<{
  label: string;
  busyLabel: string;
  busy: boolean;
  blocked?: boolean;
  type?: "submit" | "button";
  onClick?: MouseEventHandler<HTMLButtonElement> | undefined;
  secondary?: boolean;
}>) {
  return (
    <button
      type={type}
      className={secondary ? "btn swap" : "btn btn-acc swap"}
      onClick={onClick}
      aria-disabled={busy || blocked ? true : undefined}
      formNoValidate={blocked && type === "submit" ? true : undefined}
    >
      <span className={busy ? "swap-off" : undefined}>{label}</span>
      <span className={busy ? undefined : "swap-off"}>
        <Icon name="spin" className="ic ic-s spin" />
        {busyLabel}
      </span>
    </button>
  );
}
