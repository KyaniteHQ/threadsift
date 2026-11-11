import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";

import {
  type Resume,
  importNameOf,
  parseImportList,
  resumeOf,
} from "../../src/core/import-list.ts";
import { fetchImportCursor } from "./import-api.ts";

export type Check =
  | { readonly status: "none" | "checking" | "failed" }
  | { readonly status: "ready"; readonly name: string; readonly resume: Resume };

interface Answer {
  readonly links: readonly string[];
  readonly attempt: number;
  readonly check: Check;
}

async function checkOf(links: readonly string[], signal: AbortSignal): Promise<Check> {
  const name = await importNameOf(links);

  try {
    const cursor = await fetchImportCursor(name, signal);

    return { status: "ready", name, resume: resumeOf(cursor, links.length) };
  } catch {
    return { status: "failed" };
  }
}

export function useImportList(text: string) {
  const deferred = useDeferredValue(text);
  const list = useMemo(() => parseImportList(deferred), [deferred]);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [attempt, setAttempt] = useState(0);
  const { links } = list;

  useEffect(() => {
    const controller = new AbortController();

    const read = async (): Promise<void> => {
      const check = await checkOf(links, controller.signal);

      if (!controller.signal.aborted) setAnswer({ links, attempt, check });
    };

    if (links.length > 0) void read();

    return () => {
      controller.abort();
    };
  }, [links, attempt]);

  const retry = useCallback(() => {
    setAttempt((count) => count + 1);
  }, []);

  const answered = answer?.links === links && answer.attempt === attempt ? answer.check : null;

  const check: Check =
    links.length === 0 ? { status: "none" } : (answered ?? { status: "checking" });

  return { list, check, retry };
}
