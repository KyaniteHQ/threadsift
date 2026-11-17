import { registerHighlightRoutes } from "./highlight-routes.ts";
import { registerItemDetailRoute } from "./item-detail-route.ts";
import { registerNoteRoutes } from "./note-routes.ts";
import { registerReadStateRoute } from "./read-state-route.ts";

export const READER_ROUTES = [
  registerReadStateRoute,
  registerItemDetailRoute,
  registerHighlightRoutes,
  registerNoteRoutes,
];
