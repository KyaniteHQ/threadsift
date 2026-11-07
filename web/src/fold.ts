import { pixelsOf } from "./css-length.ts";

const FOLD_ROUNDING = 1;

export function exceedsFold(box: HTMLElement): boolean {
  const scroller = box.querySelector<HTMLElement>(".sx");

  if (scroller === null) return false;

  const wasFolded = box.classList.contains("folded");
  box.classList.add("folded");
  const limit = pixelsOf(getComputedStyle(scroller).maxHeight);

  if (!wasFolded) box.classList.remove("folded");

  return limit !== null && scroller.scrollHeight > limit + FOLD_ROUNDING;
}
