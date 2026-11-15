import { aiTaskOwnersStep } from "./ai-task-owner-step.ts";
import { catalogKeySteps } from "./catalog-key-step.ts";
import type { DataStep } from "./data-step-contract.ts";
import { ITEM_IDENTITY_VERSION, advanceItemIdentity } from "./item-identity.ts";

export const STEPS: readonly DataStep[] = [
  { name: "item-identity", version: ITEM_IDENTITY_VERSION, advance: advanceItemIdentity },
  ...catalogKeySteps,
  aiTaskOwnersStep,
];
