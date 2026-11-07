import { useCallback, useMemo } from "react";

import type { SettingKey } from "../../design/system/settings-table.ts";
import type { Route } from "./routing.ts";
import type { Look } from "./use-root.ts";

export function useLayoutLook(look: Look, { openId, replace }: Route): Look {
  const { pick } = look;

  const choose = useCallback(
    (key: SettingKey, id: string) => {
      pick(key, id);

      if (key === "layout" && openId !== null) replace("/");
    },
    [openId, pick, replace],
  );

  return useMemo(() => ({ ...look, pick: choose }), [look, choose]);
}
