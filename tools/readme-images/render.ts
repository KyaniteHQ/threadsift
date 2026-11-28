import { join } from "node:path";

import { capture } from "./capture.ts";
import { frame } from "./frame.ts";
import type { Instance } from "./instance.ts";
import type { Ids } from "./seed.ts";
import { sequence } from "./sequence.ts";
import { SHOTS, STYLE_SHOTS } from "./views.ts";

export async function renderAll(
  instance: Readonly<Instance>,
  ids: Ids,
  scratch: string,
  assets: string,
): Promise<void> {
  await sequence(
    SHOTS.flatMap((shot) => shot.themes.map((theme) => ({ shot, theme }))),
    async ({ shot, theme }) => {
      const raw = join(scratch, `${shot.name}-${theme}.png`);

      await capture(instance, ids, shot, theme, raw);
      await frame([raw], theme, join(assets, `${shot.name}-${theme}.webp`));
    },
  );

  const styled = STYLE_SHOTS.flatMap((shot) =>
    shot.themes.map((theme) => ({ shot, theme, raw: join(scratch, `${shot.name}.png`) })),
  );

  await sequence(styled, ({ shot, theme, raw }) => capture(instance, ids, shot, theme, raw));
  await frame(
    styled.map(({ raw }) => raw),
    "light",
    join(assets, "styles.webp"),
  );
}
