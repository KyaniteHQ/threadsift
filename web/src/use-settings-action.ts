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
  | { readonly kind: "settle"; readonly outcome: Outcome | null };

export type Task = () => Promise<Outcome | null>;

type RunAction<Action extends string> = (action: Action, task: Task) => Promise<void>;

export interface ActionButton<Action extends string> {
  readonly action: Action;
  readonly label: string;
  readonly busyLabel: string;
  readonly blocked: boolean;
  readonly onClick?: () => void;
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
    async (action, task) => {
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
  blocked,
  task,
}: Readonly<{ run: RunAction<Action>; action: Action; blocked: boolean; task: Task }>) {
  return useCallback(() => {
    if (!blocked) void run(action, task);
  }, [action, blocked, run, task]);
}

interface Labels {
  readonly label: string;
  readonly busyLabel: string;
}

interface ButtonSet<Check extends string> {
  readonly check: Check;
  readonly labels: Readonly<Record<"save" | "remove" | Check, Labels>>;
  readonly blocked: Readonly<Record<"save" | "remove" | Check, boolean>>;
  readonly press: { readonly check: () => void; readonly remove: () => void };
}

export function useActionButtons<Check extends string>({
  check,
  labels,
  blocked,
  press,
}: Readonly<ButtonSet<Check>>) {
  const saveBlocked = blocked.save;
  const checkBlocked = blocked[check];
  const removeBlocked = blocked.remove;
  const { check: pressCheck, remove: pressRemove } = press;

  return useMemo<readonly ActionButton<"save" | "remove" | Check>[]>(
    () => [
      { action: "save", ...labels.save, blocked: saveBlocked },
      { action: check, ...labels[check], blocked: checkBlocked, onClick: pressCheck },
      { action: "remove", ...labels.remove, blocked: removeBlocked, onClick: pressRemove },
    ],
    [check, labels, saveBlocked, checkBlocked, removeBlocked, pressCheck, pressRemove],
  );
}
