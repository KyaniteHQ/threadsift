import { Icon } from "./Icon.tsx";

export function SwapButton({
  label,
  busyLabel,
  busy,
  blocked = false,
}: Readonly<{ label: string; busyLabel: string; busy: boolean; blocked?: boolean }>) {
  return (
    <button
      type="submit"
      className="btn btn-acc swap"
      aria-disabled={busy || blocked ? true : undefined}
    >
      <span className={busy ? "swap-off" : undefined}>{label}</span>
      <span className={busy ? undefined : "swap-off"}>
        <Icon name="spin" className="ic ic-s spin" />
        {busyLabel}
      </span>
    </button>
  );
}
