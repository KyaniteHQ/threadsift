import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { REDUCED_MOTION } from "./jump-to-comments.ts";
import type { Route, RouteWrites } from "./routing.ts";

const RUNNING = "vt";

type Move = "open" | "close";

type Phase = "idle" | "opening" | "growing" | "closing" | "returning";

type MotionEvent =
  | { readonly kind: Move; readonly key: number; readonly run: number }
  | { readonly kind: "commit" | "settle"; readonly run: number };

type Motion =
  | { readonly phase: "idle" }
  | { readonly phase: Exclude<Phase, "idle">; readonly key: number; readonly run: number };

const IDLE: Motion = { phase: "idle" };

const MOTION: Readonly<Record<Phase, Readonly<Partial<Record<MotionEvent["kind"], Phase>>>>> = {
  idle: { open: "opening", close: "closing" },
  opening: { open: "opening", close: "closing", commit: "growing", settle: "idle" },
  growing: { open: "opening", close: "closing", settle: "idle" },
  closing: { open: "opening", close: "closing", commit: "returning", settle: "idle" },
  returning: { open: "opening", close: "closing", settle: "idle" },
};

const NAMES_ROW: Readonly<Record<Phase, boolean>> = {
  idle: false,
  opening: true,
  growing: false,
  closing: false,
  returning: true,
};

function after(motion: Motion, event: MotionEvent): Motion {
  const next = MOTION[motion.phase][event.kind];

  if (next === undefined) return motion;

  if (event.kind === "open" || event.kind === "close") {
    return next === "idle" ? IDLE : { phase: next, key: event.key, run: event.run };
  }

  if (motion.phase === "idle" || motion.run !== event.run) return motion;

  return next === "idle" ? IDLE : { ...motion, phase: next };
}

function canAnimate(): boolean {
  return "startViewTransition" in document && !matchMedia(REDUCED_MOTION).matches;
}

function useRunningClass(appOf: () => Element | null, running: boolean): void {
  useLayoutEffect(() => {
    const app = running ? appOf() : null;
    app?.classList.add(RUNNING);

    return () => {
      app?.classList.remove(RUNNING);
    };
  }, [appOf, running]);
}

function animate({
  kind,
  key,
  run,
  step,
  change,
}: Readonly<{
  kind: Move;
  key: number;
  run: number;
  step: (event: MotionEvent) => void;
  change: () => void;
}>): void {
  flushSync(() => {
    step({ kind, key, run });
  });

  const transition = document.startViewTransition(() => {
    flushSync(() => {
      step({ kind: "commit", run });
      change();
    });
  });

  const settle = (): void => {
    step({ kind: "settle", run });
  };

  transition.ready.catch(settle);
  void transition.finished.then(settle, settle);
}

export function useReaderMotion({
  route,
  covers,
  appOf,
}: Readonly<{ route: Route; covers: boolean; appOf: () => Element | null }>) {
  const [motion, setMotion] = useState<Motion>(IDLE);
  const runs = useRef(0);
  useRunningClass(appOf, motion.phase !== "idle");

  const step = useCallback((event: MotionEvent): void => {
    setMotion((current) => after(current, event));
  }, []);

  const move = useCallback(
    (kind: Move, key: number, change: (writes: RouteWrites) => void) => {
      const fromRest = kind === "open" ? route.openId === null : route.openId !== null;

      if (!covers || !fromRest || !canAnimate()) {
        change(route);

        return;
      }

      runs.current += 1;
      animate({
        kind,
        key,
        run: runs.current,
        step,
        change: () => {
          change(route.atOnce);
        },
      });
    },
    [covers, route, step],
  );

  const named = motion.phase !== "idle" && NAMES_ROW[motion.phase] ? motion.key : null;

  return { move, named };
}
