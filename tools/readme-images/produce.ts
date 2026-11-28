import { keepHighlights } from "./capture.ts";
import { startInstance } from "./instance.ts";
import { renderAll } from "./render.ts";
import type { Resources } from "./resources.ts";
import { launchRig } from "./rig.ts";
import { seedLibrary } from "./seed.ts";
import { startStubProvider } from "./stub-provider.ts";

export async function produce(
  root: string,
  scratch: string,
  out: string,
  held: Resources,
): Promise<void> {
  const provider = held.own(await startStubProvider(), (stub) => stub.stop());
  const instance = await startInstance(root, scratch, held);
  const { rig } = held.own(await launchRig(scratch), (launched) => launched.close());
  const ids = await seedLibrary(rig, instance, provider);

  await keepHighlights(rig, instance, ids);
  await renderAll(rig, instance, ids, out);
}
