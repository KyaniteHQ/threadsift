import { SettingsPanel } from "./SettingsPanel.tsx";
import { totalName } from "./text.ts";
import { usePanelState } from "./use-panel.ts";
import type { Look } from "./use-root.ts";

function Total({ count }: Readonly<{ count: number }>) {
  return (
    <span className="brand-n">
      <span aria-hidden="true">{count}</span>
      <span className="vh">{totalName(count)}</span>
    </span>
  );
}

export function Brand({ look, total }: Readonly<{ look: Look; total: number | null }>) {
  const panel = usePanelState();

  return (
    <div className="brand">
      <h1>Threadsift</h1>
      {total === null ? null : <Total count={total} />}
      <SettingsPanel look={look} panel={panel} />
    </div>
  );
}
