import { SwapButton } from "./SwapButton.tsx";
import { type ActionButton, type ActionFlow, runningAction } from "./use-settings-action.ts";

export function SettingsActions<Action extends string>({
  flow,
  buttons,
}: Readonly<{
  flow: ActionFlow<Action>;
  buttons: readonly ActionButton<Action>[];
}>) {
  const current = runningAction(flow);

  return (
    <div className="ai-actions">
      {buttons.map(({ action, label, busyLabel, blocked, onClick }) => (
        <SwapButton
          key={action}
          label={label}
          busyLabel={busyLabel}
          busy={current === action}
          blocked={current !== null || blocked}
          type={onClick === undefined ? "submit" : "button"}
          onClick={onClick}
          secondary={onClick !== undefined}
        />
      ))}
    </div>
  );
}
