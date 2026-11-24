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

export function AlertRegion({
  className,
  buttonClass,
  text,
  retry,
}: Readonly<RegionProps & { retry: (() => void) | null }>) {
  return (
    <div className={className} role="alert">
      {text === null ? null : (
        <>
          <p className="rd-note">{text}</p>
          <RetryButton buttonClass={buttonClass} retry={retry} />
        </>
      )}
    </div>
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
