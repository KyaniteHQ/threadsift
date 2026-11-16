import { pixelsOf } from "./css-length.ts";

const FOLD_ROUNDING = 1;

let foldLimitThisPass: number | null = null;

function clearFoldLimitThisPass(): void {
  foldLimitThisPass = null;
}

function readFoldLimit(box: HTMLElement, scroller: HTMLElement): number | null {
  const wasFolded = box.classList.contains("folded");
  box.classList.add("folded");
  const limit = pixelsOf(getComputedStyle(scroller).maxHeight);

  if (!wasFolded) box.classList.remove("folded");

  return limit;
}

export function exceedsFold(box: HTMLElement): boolean {
  const scroller = box.querySelector<HTMLElement>(".sx");

  if (scroller === null) return false;

  const limit = foldLimitThisPass ?? readFoldLimit(box, scroller);

  if (foldLimitThisPass === null && limit !== null) {
    foldLimitThisPass = limit;
    queueMicrotask(clearFoldLimitThisPass);
  }

  return limit !== null && scroller.scrollHeight > limit + FOLD_ROUNDING;
}
