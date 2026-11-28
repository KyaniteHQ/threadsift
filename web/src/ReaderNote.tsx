import { useCallback, useState } from "react";

import type { Item } from "../../src/core/contract/item-wire.ts";
import { noteOf, offersFetchRetry, rejectsToken } from "./paste-card.ts";
import { AlertRegion } from "./RetryRegions.tsx";
import { NOTICES, type NoticeKey, RETRY_LABEL, failureTitleOf, noticeLine } from "./text.ts";
import { useGuard } from "./use-form.ts";
import type { RetryOpened } from "./use-list-actions.ts";
import { WaitText } from "./WaitText.tsx";

function noteTextOf(item: Readonly<Item>): string | null {
  if (item.status === "failed") return failureTitleOf(item);

  if (rejectsToken(item)) return null;

  const key = noteOf(item);

  return key === null ? null : NOTICES[key];
}

export function Note({
  item,
  text,
  withRetry,
  tryAgain,
}: Readonly<{ item: Item; text: string; withRetry: boolean; tryAgain: RetryOpened }>) {
  const [answer, setAnswer] = useState<NoticeKey | null>(null);
  const { guard } = useGuard();

  const retry = useCallback(() => {
    guard(async () => {
      setAnswer(null);
      const outcome = await tryAgain(item);

      setAnswer(outcome?.kind === "notice" ? outcome.notice : null);
    });
  }, [guard, item, tryAgain]);

  if (!withRetry) return <p className="rd-note">{text}</p>;

  return (
    <div className="rd-orig">
      <p className="rd-note">{text}</p>
      <button type="button" className="btn btn-block" onClick={retry}>
        {RETRY_LABEL}
      </button>
      <AlertRegion text={answer === null ? null : noticeLine(answer, "retry")} retry={null} />
    </div>
  );
}

export function HeadNote({ item, tryAgain }: Readonly<{ item: Item; tryAgain: RetryOpened }>) {
  const text = noteTextOf(item);

  return (
    <>
      {item.wait === null ? null : (
        <p className="rd-note">
          <WaitText wait={item.wait} />
        </p>
      )}
      {text === null ? null : (
        <Note
          item={item}
          text={text}
          withRetry={item.status === "failed" || offersFetchRetry(item)}
          tryAgain={tryAgain}
        />
      )}
    </>
  );
}
