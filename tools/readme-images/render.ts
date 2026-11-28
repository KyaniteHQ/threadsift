import { join } from "node:path";

import { capture } from "./capture.ts";
import { frame } from "./frame.ts";
import type { Instance } from "./instance.ts";
import type { Rig } from "./rig.ts";
import type { Ids } from "./seed.ts";
import { sequence } from "./sequence.ts";
import { SHOTS, STYLE_SHOTS } from "./views.ts";

export async function renderAll(
  rig: Readonly<Rig>,
  instance: Readonly<Instance>,
  ids: Ids,
  out: string,
): Promise<void> {
  await sequence(
    SHOTS.flatMap((shot) => shot.themes.map((theme) => ({ shot, theme }))),
    async ({ shot, theme }) => {
      const raw = join(rig.scratch, `${shot.name}-${theme}.png`);

      await capture(rig, instance, ids, shot, theme, raw);
      await frame(rig, [raw], theme, join(out, `${shot.name}-${theme}.webp`));
    },
  );

  const styled = STYLE_SHOTS.flatMap((shot) =>
    shot.themes.map((theme) => ({ shot, theme, raw: join(rig.scratch, `${shot.name}.png`) })),
  );

  await sequence(styled, ({ shot, theme, raw }) => capture(rig, instance, ids, shot, theme, raw));
  await frame(
    rig,
    styled.map(({ raw }) => raw),
    "light",
    join(out, "styles.webp"),
  );
}
