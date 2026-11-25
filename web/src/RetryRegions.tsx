import type { ReactNode } from "react";

import { Notice } from "./ListBody.tsx";
import { RETRY_LABEL } from "./text.ts";

interface RegionProps {
  readonly className?: string;
  readonly buttonClass?: string | undefined;
  readonly text: string | null;
}

function RetryButton({
  buttonClass = "btn",
  retry,
}: Readonly<{ buttonClass?: string | undefined; retry: (() => void) | null }>) {
  return retry === null ? null : (
    <button type="button" className={buttonClass} onClick={retry}>
      {RETRY_LABEL}
    </button>
  );
}

function Alert({
  className,
  children,
}: Readonly<{ className?: string | undefined; children: ReactNode }>) {
  return (
    <div className={className} role="alert">
      {children}
    </div>
  );
}

export function AlertRegion({
  className,
  buttonClass,
  text,
  retry,
}: Readonly<RegionProps & { retry: (() => void) | null }>) {
  return (
    <Alert className={className}>
      {text === null ? null : (
        <>
          <p className="rd-note">{text}</p>
          <RetryButton buttonClass={buttonClass} retry={retry} />
        </>
      )}
    </Alert>
  );
}

export function RetryNotice({
  failed,
  text,
  action,
}: Readonly<{ failed: boolean; text: string; action: () => void }>) {
  return (
    <Alert>{failed ? <Notice text={text} action={action} label={RETRY_LABEL} /> : null}</Alert>
  );
}

export function StatusRegion({
  className,
  buttonClass,
  text,
  retry,
}: Readonly<RegionProps & { retry: () => void }>) {
  return (
    <output className={className}>
      {text === null ? null : (
        <>
          <span className="rd-note">{text}</span>
          <RetryButton buttonClass={buttonClass} retry={retry} />
        </>
      )}
    </output>
  );
}
