import { useMemo, useState } from "react";

import {
  VaultInputSchema,
  VaultVerifyInputSchema,
  type VaultRefusal,
  type VaultView,
} from "../../src/core/contract/vault-contract.ts";
import { AI_TEXT } from "./ai-text.ts";
import { removeObsidian, saveObsidian, verifyObsidian } from "./obsidian-api.ts";
import { OBSIDIAN_TEXT as TEXT } from "./obsidian-text.ts";
import { useField } from "./use-form.ts";
import {
  type Outcome,
  type Task,
  outcomeOf,
  runningAction,
  useAction,
  useActionButtons,
  useActionFlow,
} from "./use-settings-action.ts";

const REASONS = {
  "secret-missing": AI_TEXT["secret-missing"],
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

const LABELS = {
  save: { label: TEXT.save, busyLabel: TEXT.saving },
  verify: { label: TEXT.verify, busyLabel: TEXT.verifying },
  remove: { label: TEXT.remove, busyLabel: TEXT.removing },
} as const;

function useDraft(view: VaultView) {
  const [mode, setMode] = useState<Mode>(view.mode);
  const repository = useField(null, view.mode === "github" ? view.repository : "");
  const branch = useField(null, view.mode === "github" ? view.branch : "main");
  const folder = useField(null, view.mode === "folder" ? view.folder : "");
  const token = useField();
  const fields = useMemo<Draft>(
    () =>
      mode === "folder"
        ? { mode, folder: folder.value }
        : { mode, repository: repository.value, branch: branch.value, token: token.value },
    [mode, folder.value, repository.value, branch.value, token.value],
  );

  return { mode, setMode, repository, branch, folder, token, fields };
}

function useTasks(fields: Draft, changed: (view: VaultView) => void, clear: () => void) {
  return useMemo(() => {
    const perform =
      (action: Action): Task =>
      () =>
        performObsidian(action, fields, changed, clear);

    return { save: perform("save"), verify: perform("verify"), remove: perform("remove") };
  }, [fields, changed, clear]);
}

function useActions(
  view: VaultView,
  { mode, fields, token }: Readonly<ReturnType<typeof useDraft>>,
  changed: (view: VaultView) => void,
) {
  const { flow, run } = useActionFlow<Action>(TEXT.failed);
  const secretMissing = mode === "github" && !view.secretReady ? AI_TEXT["secret-missing"] : null;
  const unavailable = {
    save: secretMissing,
    verify: secretMissing,
    remove: view.mode === "github" && view.token === "none" ? TEXT.missing : null,
  } as const;

  const task = useTasks(fields, changed, token.clear);

  const submit = useAction({
    run,
    action: "save",
    unavailable: unavailable.save,
    task: task.save,
  });

  const verifyNow = useAction({
    run,
    action: "verify",
    unavailable: unavailable.verify,
    task: task.verify,
  });

  const removeNow = useAction({
    run,
    action: "remove",
    unavailable: null,
    task: task.remove,
  });

  const buttons = useActionButtons({
    check: "verify",
    labels: LABELS,
    unavailable,
    showReason: secretMissing !== null,
    press: { check: verifyNow, remove: removeNow },
  });

  return { flow, submit, buttons };
}

export function useObsidian(view: VaultView, changed: (view: VaultView) => void) {
  const draft = useDraft(view);
  const { flow, submit, buttons } = useActions(view, draft, changed);
  const { mode, setMode, folder, repository, branch, token } = draft;

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
