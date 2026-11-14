import { useCallback, useMemo } from "react";

import { useFlow } from "./use-flow.ts";

export interface Outcome {
  readonly kind: "ok" | "error";
  readonly text: string;
}

export type ActionFlow<Action extends string> =
  | { readonly kind: "idle" }
  | { readonly kind: "running"; readonly action: Action }
  | { readonly kind: "done"; readonly action: Action; readonly outcome: Outcome };

type ActionEvent<Action extends string> =
  | { readonly kind: "begin"; readonly action: Action }
  | { readonly kind: "settle"; readonly outcome: Outcome | null }
  | { readonly kind: "refuse"; readonly action: Action; readonly text: string };

export type Task = () => Promise<Outcome | null>;

export type Unavailable = string | null;

export type RunAction<Action extends string> = (
  action: Action,
  task: Task,
  unavailable?: Unavailable,
) => Promise<void>;

export interface ActionButton<Action extends string> {
  readonly action: Action;
  readonly label: string;
  readonly busyLabel: string;
  readonly blocked: boolean;
  readonly onClick?: () => void;
  readonly secondary: boolean;
}

function reduceFlow<Action extends string>(
  flow: ActionFlow<Action>,
  event: ActionEvent<Action>,
): ActionFlow<Action> {
  switch (event.kind) {
    case "begin":
      return flow.kind === "running" ? flow : { kind: "running", action: event.action };
    case "settle":
      if (flow.kind !== "running") return flow;

      return event.outcome === null
        ? { kind: "idle" }
        : { kind: "done", action: flow.action, outcome: event.outcome };
    case "refuse":
      return flow.kind === "running"
        ? flow
        : { kind: "done", action: event.action, outcome: { kind: "error", text: event.text } };
    default: {
      const exhaustive: never = event;

      return exhaustive;
    }
  }
}

export function runningAction<Action extends string>(flow: Readonly<ActionFlow<Action>>) {
  return flow.kind === "running" ? flow.action : null;
}

export function outcomeOf<Action extends string>(flow: Readonly<ActionFlow<Action>>) {
  return flow.kind === "done" ? flow.outcome : null;
}

export function useActionFlow<Action extends string>(failedText: string) {
  const [flow, send] = useFlow<ActionFlow<Action>, ActionEvent<Action>>(reduceFlow, {
    kind: "idle",
  });

  const run: RunAction<Action> = useCallback(
    async (action, task, unavailable = null) => {
      if (unavailable !== null) {
        send({ kind: "refuse", action, text: unavailable });

        return;
      }

      if (!send({ kind: "begin", action })) return;

      try {
        send({ kind: "settle", outcome: await task() });
      } catch {
        send({ kind: "settle", outcome: { kind: "error", text: failedText } });
      }
    },
    [failedText, send],
  );

  return { flow, run };
}

export function useAction<Action extends string>({
  run,
  action,
  unavailable,
  task,
}: Readonly<{ run: RunAction<Action>; action: Action; unavailable: Unavailable; task: Task }>) {
  return useCallback(() => {
    void run(action, task, unavailable);
  }, [action, unavailable, run, task]);
}

interface Labels {
  readonly label: string;
  readonly busyLabel: string;
}

interface ButtonSet<Check extends string> {
  readonly check: Check;
  readonly labels: Readonly<Record<"save" | "remove" | Check, Labels>>;
  readonly unavailable: Readonly<Record<"save" | "remove" | Check, Unavailable>>;
  readonly press: { readonly check: () => void; readonly remove: () => void };
  readonly saveSecondary?: boolean;
}

export function useActionButtons<Check extends string>({
  check,
  labels,
  unavailable,
  press,
  saveSecondary = false,
}: Readonly<ButtonSet<Check>>) {
  const saveBlocked = unavailable.save !== null;
  const checkBlocked = unavailable[check] !== null;
  const removeBlocked = unavailable.remove !== null;
  const { check: pressCheck, remove: pressRemove } = press;

  return useMemo<readonly ActionButton<"save" | "remove" | Check>[]>(
    () => [
      { action: "save", ...labels.save, blocked: saveBlocked, secondary: saveSecondary },
      {
        action: check,
        ...labels[check],
        blocked: checkBlocked,
        onClick: pressCheck,
        secondary: true,
      },
      {
        action: "remove",
        ...labels.remove,
        blocked: removeBlocked,
        onClick: pressRemove,
        secondary: true,
      },
    ],
    [
      check,
      labels,
      saveBlocked,
      checkBlocked,
      removeBlocked,
      pressCheck,
      pressRemove,
      saveSecondary,
    ],
  );
}
