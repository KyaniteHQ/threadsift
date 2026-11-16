import { type RefObject, useCallback, useEffect, useId, useRef } from "react";

import type { Item } from "../../src/http/schemas.ts";
import { Alert } from "./Alert.tsx";
import { CLOSED, type DeleteEvent, type DeleteFlow, reduceDelete } from "./delete-flow.ts";
import { Icon } from "./Icon.tsx";
import {
  CANCEL_LABEL,
  DELETE_CONFIRM,
  DELETE_DESCRIPTION,
  DELETE_FAILED,
  DELETE_LABEL,
  DELETE_PENDING,
  DELETE_TITLE,
} from "./reader-text.ts";
import { useFlow } from "./use-flow.ts";
import { useModalDialog } from "./use-modal-dialog.ts";

function useDeleteModal(
  dialog: RefObject<HTMLDialogElement | null>,
  first: RefObject<HTMLElement | null>,
  step: Readonly<{ pending: boolean; cancel: () => void }>,
): void {
  useModalDialog(dialog, step, (element, signal, latest) => {
    element.addEventListener(
      "cancel",
      (event) => {
        event.preventDefault();

        const { pending, cancel } = latest();

        if (!pending) cancel();
      },
      { signal },
    );
    element.addEventListener(
      "close",
      () => {
        const { pending, cancel } = latest();

        if (pending) dialog.current?.showModal();
        else cancel();
      },
      { signal },
    );
    first.current?.focus();
  });
}

function useHoldFocus(dialog: RefObject<HTMLDialogElement | null>, pending: boolean): void {
  useEffect(() => {
    if (pending) dialog.current?.focus();
  }, [dialog, pending]);
}

function Actions({
  pending,
  cancel,
  confirm,
  first,
}: Readonly<{
  pending: boolean;
  cancel: () => void;
  confirm: () => void;
  first: RefObject<HTMLButtonElement | null>;
}>) {
  return (
    <div className="dlg-acts">
      <button ref={first} type="button" className="btn" disabled={pending} onClick={cancel}>
        {CANCEL_LABEL}
      </button>
      <button type="button" className="btn btn-danger" disabled={pending} onClick={confirm}>
        {pending ? DELETE_PENDING : DELETE_CONFIRM}
      </button>
    </div>
  );
}

function DeleteDialog({
  step,
  cancel,
  confirm,
}: Readonly<{
  step: Exclude<DeleteFlow["kind"], "closed">;
  cancel: () => void;
  confirm: () => void;
}>) {
  const dialog = useRef<HTMLDialogElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const textId = useId();
  const pending = step === "pending";
  useDeleteModal(dialog, first, { pending, cancel });
  useHoldFocus(dialog, pending);

  return (
    <dialog
      ref={dialog}
      className="dlg"
      aria-labelledby={titleId}
      aria-describedby={textId}
      aria-busy={pending}
      tabIndex={-1}
    >
      <h2 id={titleId} className="dlg-title">
        {DELETE_TITLE}
      </h2>
      <p id={textId} className="dlg-text">
        {DELETE_DESCRIPTION}
      </p>
      <Alert text={step === "failed" ? DELETE_FAILED : null} />
      <Actions pending={pending} cancel={cancel} confirm={confirm} first={first} />
    </dialog>
  );
}

function useReturnFocus(asking: boolean, trigger: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const button = trigger.current;

    return () => {
      if (asking) button?.focus();
    };
  }, [asking, trigger]);
}

async function settleDelete(remove: () => Promise<void>, send: (event: DeleteEvent) => boolean) {
  try {
    await remove();
    send({ kind: "delete" });
  } catch {
    send({ kind: "refuse" });
  }
}

function useDeleteFlow(item: Item, remove: (item: Item) => Promise<void>) {
  const [flow, send] = useFlow(reduceDelete, CLOSED);

  const ask = useCallback(() => {
    send({ kind: "ask" });
  }, [send]);

  const cancel = useCallback(() => {
    send({ kind: "cancel" });
  }, [send]);

  const confirm = useCallback(() => {
    if (!send({ kind: "confirm" })) return;

    void settleDelete(() => remove(item), send);
  }, [item, remove, send]);

  return { flow, ask, cancel, confirm };
}

export function DeleteItem({
  item,
  remove,
}: Readonly<{ item: Item; remove: (item: Item) => Promise<void> }>) {
  const { flow, ask, cancel, confirm } = useDeleteFlow(item, remove);
  const trigger = useRef<HTMLButtonElement>(null);
  useReturnFocus(flow.kind !== "closed", trigger);

  return (
    <>
      <button ref={trigger} type="button" className="btn rd-act" onClick={ask}>
        <Icon name="trash" className="ic rd-del-ic" />
        <span className="rd-act-l">{DELETE_LABEL}</span>
      </button>
      {flow.kind === "closed" ? null : (
        <DeleteDialog step={flow.kind} cancel={cancel} confirm={confirm} />
      )}
    </>
  );
}
