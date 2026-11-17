import { useCallback, useMemo } from "react";

import {
  VaultInputSchema,
  VaultVerifyInputSchema,
  type VaultRefusal,
  type VaultView,
} from "../../src/core/vault-contract.ts";
import { removeObsidian, saveObsidian, verifyObsidian } from "./obsidian-api.ts";
import { OBSIDIAN_TEXT as TEXT } from "./obsidian-text.ts";
import { useField } from "./use-form.ts";
import { type Outcome, useActionFlow, outcomeOf, runningAction } from "./use-settings-action.ts";

const REASONS = {
  "secret-missing": TEXT.secretMissing,
  "not-configured": TEXT.missing,
  "wrong-token": TEXT.wrongToken,
  "not-found": TEXT.notFound,
  permission: TEXT.permission,
  "rate-limited": TEXT.rateLimited,
  unreachable: TEXT.unreachable,
  "github-error": TEXT.githubError,
  timeout: TEXT.timeout,
} satisfies Readonly<Record<VaultRefusal["reason"], string>>;

type Action = "save" | "verify" | "remove";

export function useObsidian(view: VaultView, changed: (view: VaultView) => void) {
  const repository = useField(null, view.repository);
  const branch = useField(null, view.branch);
  const token = useField();
  const { flow, run } = useActionFlow<Action>(TEXT.failed);
  const fields = useMemo(
    () => ({ repository: repository.value, branch: branch.value, token: token.value }),
    [repository.value, branch.value, token.value],
  );

  const perform = useCallback(
    (name: Action) => performObsidian(name, fields, changed, token.clear),
    [fields, changed, token.clear],
  );

  const action = useCallback(
    (name: Action) => {
      void run(
        name,
        () => perform(name),
        name !== "remove" && !view.secretReady ? TEXT.secretMissing : null,
      );
    },
    [run, perform, view.secretReady],
  );
  const submit = useCallback(() => {
    action("save");
  }, [action]);
  const buttons = obsidianButtons(view, action);

  return {
    repository,
    branch,
    token,
    submit,
    buttons,
    busy: flow.kind === "running",
    running: runningAction(flow),
    outcome: outcomeOf(flow),
  };
}

async function performObsidian(
  action: Action,
  fields: Readonly<{ repository: string; branch: string; token: string }>,
  changed: (view: VaultView) => void,
  clear: () => void,
): Promise<Outcome> {
  if (action === "remove") {
    changed(await removeObsidian());
    clear();
    return { kind: "ok", text: TEXT.removed };
  }
  const result = await sendObsidian(action, fields);
  if (result === null) return { kind: "error", text: TEXT.invalid };
  if ("kind" in result)
    return result.kind === "verified"
      ? { kind: "ok", text: TEXT.verified }
      : { kind: "error", text: REASONS[result.reason] };
  changed(result);
  clear();
  return { kind: "ok", text: TEXT.saved };
}

function sendObsidian(
  action: "save" | "verify",
  fields: Readonly<{ repository: string; branch: string; token: string }>,
) {
  if (action === "save") {
    const input = VaultInputSchema.safeParse(fields);
    return input.success ? saveObsidian(input.data) : null;
  }
  const candidate =
    fields.token === "" ? { repository: fields.repository, branch: fields.branch } : fields;
  const input = VaultVerifyInputSchema.safeParse(candidate);
  return input.success ? verifyObsidian(input.data) : null;
}

function obsidianButton(name: Action, view: VaultView, action: (name: Action) => void) {
  const labels = {
    save: [TEXT.save, TEXT.saving],
    verify: [TEXT.verify, TEXT.verifying],
    remove: [TEXT.remove, TEXT.removing],
  } as const;
  const button = {
    action: name,
    label: labels[name][0],
    busyLabel: labels[name][1],
    blocked: name === "remove" ? view.token === "none" : !view.secretReady,
    hint: name !== "remove" && !view.secretReady ? TEXT.secretMissing : undefined,
    secondary: name !== "save",
  };
  return name === "save"
    ? button
    : {
        ...button,
        onClick: () => {
          action(name);
        },
      };
}

function obsidianButtons(view: VaultView, action: (name: Action) => void) {
  return (["save", "verify", "remove"] as const).map((name) => obsidianButton(name, view, action));
}
