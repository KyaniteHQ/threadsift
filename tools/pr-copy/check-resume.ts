import { copyNames, inventory } from "./cloudflare.ts";
import { resumeDelivery } from "./copy-control.ts";
import { clearProvider } from "./d1.ts";
import { withStage } from "./stage.ts";

const CLEAR_ALLOWANCE_MS = 60_000;

export function resumeOnly(pr: number, clearsProvider: boolean): Promise<boolean> {
  return withStage(copyNames(pr), null, async (stage) => {
    const found = await inventory(stage.target);
    const resumed = found.queues.length > 0 && (await resumeDelivery(stage));
    const database = found.databases.find((row) => row.name === stage.target.name);

    if (clearsProvider && database !== undefined) {
      await clearProvider(
        stage,
        { name: database.name, id: database.uuid },
        Date.now() + CLEAR_ALLOWANCE_MS,
      );
    }

    return resumed;
  });
}
