import { SwapButton } from "./SwapButton.tsx";

export interface ActionButton<Action extends string> {
  readonly action: Action;
  readonly label: string;
  readonly busyLabel: string;
  readonly blocked: boolean;
  readonly onClick?: () => void;
}

export function SettingsActions<Action extends string>({
  busy,
  current,
  buttons,
}: Readonly<{
  busy: boolean;
  current: Action | null;
  buttons: readonly ActionButton<Action>[];
}>) {
  return (
    <div className="ai-actions">
      {buttons.map(({ action, label, busyLabel, blocked, onClick }) => (
        <SwapButton
          key={action}
          label={label}
          busyLabel={busyLabel}
          busy={busy && current === action}
          blocked={busy || blocked}
          type={onClick === undefined ? "submit" : "button"}
          onClick={onClick}
          secondary={onClick !== undefined}
        />
      ))}
    </div>
  );
}
