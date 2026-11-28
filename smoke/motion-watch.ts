import { type Page, expect } from "@playwright/test";

interface MoveEvent {
  readonly run: number;
  readonly stage: "started" | "ready" | "skipped" | "finished";
  readonly shared: readonly string[];
}

export interface Move {
  readonly ready: boolean;
  readonly finished: boolean;
  readonly shared: readonly string[];
}

function watch(report: (event: MoveEvent) => void): void {
  const start = document.startViewTransition.bind(document);
  let runs = 0;
  let pending = 0;

  const mark = (): void => {
    document.documentElement.dataset["motionRuns"] = String(runs);
    document.documentElement.dataset["motionPending"] = String(pending);
  };

  const follow = async (transition: ViewTransition, run: number): Promise<void> => {
    try {
      await transition.ready;
      const effects = document.documentElement
        .getAnimations({ subtree: true })
        .map((each) => each.effect)
        .filter((each) => each instanceof KeyframeEffect);
      const moved = effects.filter((each) => {
        const frames = each.getKeyframes();
        return ["width", "height", "transform"].some(
          (key) => String(frames.at(0)?.[key]) !== String(frames.at(-1)?.[key]),
        );
      });
      const groups = moved.map(
        (each) => /^::view-transition-group\((.+)\)$/u.exec(each.pseudoElement ?? "")?.[1],
      );
      const names = new Set(effects.map((each) => each.pseudoElement ?? ""));

      const shared = groups.filter(
        (name): name is string =>
          name !== undefined &&
          name !== "root" &&
          names.has(`::view-transition-old(${name})`) &&
          names.has(`::view-transition-new(${name})`),
      );
      report({ run, stage: "ready", shared });
    } catch {
      report({ run, stage: "skipped", shared: [] });
    }
    await transition.finished.catch(() => null);
    pending -= 1;
    mark();
    report({ run, stage: "finished", shared: [] });
  };

  document.startViewTransition = (update) => {
    const transition = start(update);
    runs += 1;
    pending += 1;
    mark();
    report({ run: runs, stage: "started", shared: [] });
    void follow(transition, runs);

    return transition;
  };
}

const motionState = (page: Page) =>
  page.evaluate(() => ({
    runs: Number(document.documentElement.dataset["motionRuns"] ?? "0"),
    pending: Number(document.documentElement.dataset["motionPending"] ?? "0"),
  }));

export async function watchMoves(page: Page) {
  const seen = new Map<number, Move>();
  let since = 0;

  await page.addInitScript(
    watch,
    (event: MoveEvent) => {
      const known = seen.get(event.run) ?? { ready: false, finished: false, shared: [] };
      const next = {
        started: known,
        ready: { ...known, ready: true, shared: event.shared },
        skipped: known,
        finished: { ...known, finished: true },
      };
      seen.set(event.run, next[event.stage]);
    },
    { exposeFunctions: true },
  );

  const forget = async (): Promise<void> => {
    since = (await motionState(page)).runs;
    seen.clear();
  };

  const settled = async (): Promise<Move | undefined> => {
    await expect
      .poll(async () => {
        const { runs, pending } = await motionState(page);
        const moves = [...seen.values()];
        return (
          pending === 0 && moves.length === runs - since && moves.every((move) => move.finished)
        );
      })
      .toBe(true);

    return [...seen.values()].at(0);
  };

  return { forget, settled };
}

export function grewOrRanBack(move: Move | undefined): boolean {
  return move !== undefined && move.ready && move.shared.length === 1;
}
