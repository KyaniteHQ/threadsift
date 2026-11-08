import { useCallback } from "react";

import type { Item } from "../../src/http/schemas.ts";
import { noteOf } from "./paste-card.ts";
import { FAILURE_TITLES, NOTICES, RETRY_LABEL } from "./text.ts";
import { WaitText } from "./WaitText.tsx";

function noteTextOf(item: Readonly<Item>): string | null {
  if (item.status === "failed") return FAILURE_TITLES[item.reason];

  if (item.fetch === "github-token") return null;

  const key = noteOf(item);

  return key === null ? null : NOTICES[key].text;
}

export function Note({
  item,
  text,
  withRetry,
  tryAgain,
}: Readonly<{ item: Item; text: string; withRetry: boolean; tryAgain: (item: Item) => void }>) {
  const retry = useCallback(() => {
    tryAgain(item);
  }, [item, tryAgain]);

  if (!withRetry) return <p className="rd-note">{text}</p>;

  return (
    <div className="rd-orig">
      <p className="rd-note">{text}</p>
      <button type="button" className="btn btn-block" onClick={retry}>
        {RETRY_LABEL}
      </button>
    </div>
  );
}

export function HeadNote({
  item,
  tryAgain,
}: Readonly<{ item: Item; tryAgain: (item: Item) => void }>) {
  const text = noteTextOf(item);

  return (
    <>
      {item.wait === null ? null : (
        <p className="rd-note">
          <WaitText retryAt={item.wait.retryAt} />
        </p>
      )}
      {text === null ? null : (
        <Note item={item} text={text} withRetry={item.status === "failed"} tryAgain={tryAgain} />
      )}
    </>
  );
}
