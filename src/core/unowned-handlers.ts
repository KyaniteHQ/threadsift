import { exportHandler } from "./export-job.ts";
import { restoreHandler } from "./restore-job.ts";

export const UNOWNED_HANDLERS = { export: exportHandler, restore: restoreHandler };
