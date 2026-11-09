import {
  type RefObject,
  useCallback,
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import type { Item } from "../../src/http/schemas.ts";
import { Icon } from "./Icon.tsx";
import { tabWrapTarget } from "./panel-dom.ts";
import {
  CANCEL_LABEL,
  DELETE_CONFIRM,
  DELETE_DESCRIPTION,
  DELETE_FAILED,
  DELETE_LABEL,
  DELETE_PENDING,
  DELETE_TITLE,
} from "./reader-text.ts";
import { useAfter } from "./use-form.ts";

type Step = "closed" | "asking" | "pending" | "failed";

const NOTHING = (): void => undefined;

const DELETE_WAIT_MS = 20_000;

function containTab(dialog: HTMLElement, signal: AbortSignal): void {
  dialog.addEventListener(
    "keydown",
    (event) => {
      const wrapTo = event.key === "Tab" ? tabWrapTarget(dialog, event.shiftKey) : null;

      if (wrapTo !== null) {
        event.preventDefault();
        wrapTo.focus();
      }
    },
    { signal },
  );
}

function useModal(
  dialog: RefObject<HTMLDialogElement | null>,
  first: RefObject<HTMLElement | null>,
  { pending, cancel }: Readonly<{ pending: boolean; cancel: () => void }>,
): void {
  const refuse = useEffectEvent(() => {
    if (!pending) cancel();
  });

  const restore = useEffectEvent(() => {
    if (pending) dialog.current?.showModal();
    else cancel();
  });

  useLayoutEffect(() => {
    const element = dialog.current;

    if (element === null) return NOTHING;

    const listeners = new AbortController();
    const { signal } = listeners;

    element.addEventListener(
      "cancel",
      (event) => {
        event.preventDefault();
        refuse();
      },
      { signal },
    );
    element.addEventListener(
      "close",
      () => {
        restore();
      },
      { signal },
    );
    containTab(element, signal);
    element.showModal();
    first.current?.focus();

    return () => {
      listeners.abort();
      element.close();
    };
  }, [dialog, first]);
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
}: Readonly<{ step: Exclude<Step, "closed">; cancel: () => void; confirm: () => void }>) {
  const dialog = useRef<HTMLDialogElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const textId = useId();
  const pending = step === "pending";
  useModal(dialog, first, { pending, cancel });
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
      {step === "failed" ? (
        <p className="fld-err" role="alert">
          {DELETE_FAILED}
        </p>
      ) : null}
      <Actions pending={pending} cancel={cancel} confirm={confirm} first={first} />
    </dialog>
  );
}

function useReturnFocus(asking: boolean, trigger: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const button = trigger.current;

    return asking
      ? () => {
          button?.focus();
        }
      : NOTHING;
  }, [asking, trigger]);
}

export function DeleteItem({
  item,
  remove,
}: Readonly<{ item: Item; remove: (item: Item) => Promise<void> }>) {
  const [step, setStep] = useState<Step>("closed");
  const trigger = useRef<HTMLButtonElement>(null);
  useReturnFocus(step !== "closed", trigger);

  const ask = useCallback(() => {
    setStep("asking");
  }, []);

  const cancel = useCallback(() => {
    setStep("closed");
  }, []);

  const confirm = useCallback(() => {
    setStep("pending");
    remove(item).catch(() => {
      setStep("failed");
    });
  }, [item, remove]);

  const timedOut = useCallback(() => {
    setStep("failed");
  }, []);

  useAfter(step === "pending", DELETE_WAIT_MS, timedOut);

  return (
    <>
      <button ref={trigger} type="button" className="btn rd-act" onClick={ask}>
        <Icon name="trash" className="ic rd-del-ic" />
        <span className="rd-act-l">{DELETE_LABEL}</span>
      </button>
      {step === "closed" ? null : <DeleteDialog step={step} cancel={cancel} confirm={confirm} />}
    </>
  );
}
