import { type ChangeEvent, useCallback, useId } from "react";

import { LAYOUT, type SettingKey, type Settings } from "../../design/system/settings-table.ts";
import { Icon } from "./Icon.tsx";

const ICONS = { list: "rows", grid: "grid" } as const satisfies Record<Settings["layout"], string>;

export function LayoutToggle({
  layout,
  pick,
}: Readonly<{ layout: Settings["layout"]; pick: (key: SettingKey, id: string) => void }>) {
  const name = useId();

  const change = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      pick(LAYOUT.key, event.target.value);
    },
    [pick],
  );

  return (
    <div role="radiogroup" className="st-seg lay-tg" aria-label={LAYOUT.label}>
      {LAYOUT.options.map((option) => (
        <label key={option.id} className="st-b" htmlFor={`${name}-${option.id}`}>
          <input
            id={`${name}-${option.id}`}
            type="radio"
            className="st-in"
            name={name}
            value={option.id}
            checked={layout === option.id}
            aria-label={option.label}
            onChange={change}
          />
          <Icon name={ICONS[option.id]} className="ic" />
        </label>
      ))}
    </div>
  );
}
