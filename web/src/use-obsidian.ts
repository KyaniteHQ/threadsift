import { useCallback, useMemo, useState } from "react";

import {
  VaultInputSchema,
  VaultVerifyInputSchema,
  type VaultRefusal,
  type VaultView,
} from "../../src/core/contract/vault-contract.ts";
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
  "folder-unavailable": TEXT.folderUnavailable,
  "folder-missing": TEXT.folderMissing,
  "folder-permission": TEXT.folderPermission,
  "folder-path": TEXT.folderPath,
  "folder-full": TEXT.folderFull,
  "folder-links": TEXT.folderLinks,
  "folder-failed": TEXT.folderFailed,
  "vault-busy": TEXT.vaultBusy,
} satisfies Readonly<Record<VaultRefusal["reason"], string>>;

type Action = "save" | "verify" | "remove";
type Mode = VaultView["mode"];
type Draft =
  | Readonly<{ mode: "github"; repository: string; branch: string; token: string }>
  | Readonly<{ mode: "folder"; folder: string }>;

export function useObsidian(view: VaultView, changed: (view: VaultView) => void) {
  const [mode, setMode] = useState<Mode>(view.mode);
  const repository = useField(null, view.mode === "github" ? view.repository : "");
  const branch = useField(null, view.mode === "github" ? view.branch : "main");
  const folder = useField(null, view.mode === "folder" ? view.folder : "");
  const token = useField();
  const { flow, run } = useActionFlow<Action>(TEXT.failed);
  const fields = useMemo<Draft>(
    () =>
      mode === "folder"
        ? { mode, folder: folder.value }
        : { mode, repository: repository.value, branch: branch.value, token: token.value },
    [mode, folder.value, repository.value, branch.value, token.value],
  );
  const needsSecret = mode === "github" && !view.secretReady;

  const perform = useCallback(
    (name: Action) => performObsidian(name, fields, changed, token.clear),
    [fields, changed, token.clear],
  );

  const action = useCallback(
    (name: Action) => {
      void run(
        name,
        () => perform(name),
        name !== "remove" && needsSecret ? TEXT.secretMissing : null,
      );
    },
    [run, perform, needsSecret],
  );
  const submit = useCallback(() => {
    action("save");
  }, [action]);
  const buttons = obsidianButtons(view, needsSecret, action);

  return {
    mode,
    setMode,
    folder,
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
  fields: Draft,
  changed: (view: VaultView) => void,
  clear: () => void,
): Promise<Outcome> {
  const result = await (action === "remove" ? removeObsidian() : sendObsidian(action, fields));
  if (result === null)
    return { kind: "error", text: fields.mode === "folder" ? TEXT.folderInvalid : TEXT.invalid };
  if ("kind" in result) {
    if (result.kind === "refused") return { kind: "error", text: REASONS[result.reason] };
    return { kind: "ok", text: fields.mode === "folder" ? TEXT.folderVerified : TEXT.verified };
  }
  changed(result);
  clear();
  return { kind: "ok", text: action === "remove" ? TEXT.removed : TEXT.saved };
}

function sendObsidian(action: "save" | "verify", fields: Draft) {
  if (action === "save") {
    const input = VaultInputSchema.safeParse(fields);
    return input.success ? saveObsidian(input.data) : null;
  }
  const candidate =
    fields.mode === "github" && fields.token === ""
      ? { mode: fields.mode, repository: fields.repository, branch: fields.branch }
      : fields;
  const input = VaultVerifyInputSchema.safeParse(candidate);
  return input.success ? verifyObsidian(input.data) : null;
}

function obsidianButton(
  name: Action,
  view: VaultView,
  needsSecret: boolean,
  action: (name: Action) => void,
) {
  const labels = {
    save: [TEXT.save, TEXT.saving],
    verify: [TEXT.verify, TEXT.verifying],
    remove: [TEXT.remove, TEXT.removing],
  } as const;
  const button = {
    action: name,
    label: labels[name][0],
    busyLabel: labels[name][1],
    blocked: name === "remove" ? view.mode === "github" && view.token === "none" : needsSecret,
    hint: name !== "remove" && needsSecret ? TEXT.secretMissing : undefined,
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

function obsidianButtons(view: VaultView, needsSecret: boolean, action: (name: Action) => void) {
  return (["save", "verify", "remove"] as const).map((name) =>
    obsidianButton(name, view, needsSecret, action),
  );
}
