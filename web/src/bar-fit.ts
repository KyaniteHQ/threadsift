import { pixelsOf } from "./css-length.ts";

const PARTS = ".rd-back, .rd-hint, .rd-act";
const TOLERANCE = 0.5;
const ROUNDING = 1;

export function barOverflows(bar: HTMLElement): boolean {
  const box = bar.getBoundingClientRect();
  const style = getComputedStyle(bar);
  const left = box.left + (pixelsOf(style.paddingLeft) ?? 0) - TOLERANCE;
  const right = box.right - (pixelsOf(style.paddingRight) ?? 0) + TOLERANCE;
  let previousRight: number | null = null;

  for (const part of bar.querySelectorAll<HTMLElement>(PARTS)) {
    const edge = part.getBoundingClientRect();

    if (edge.width > 0) {
      const outside = edge.left < left || edge.right > right;
      const cut = part.scrollWidth > part.clientWidth + ROUNDING;
      const overlaps = previousRight !== null && edge.left < previousRight - TOLERANCE;

      if (outside || cut || overlaps) return true;

      previousRight = edge.right;
    }
  }

  return false;
}

export interface BarStep {
  readonly hint: boolean;
  readonly labels: boolean;
}

function applyStep(bar: HTMLElement, step: Readonly<BarStep>): void {
  bar.classList.toggle("icons", !step.labels);
  bar.querySelector(".rd-back")?.classList.toggle("bare", !step.labels);

  const hint = bar.querySelector<HTMLElement>(".rd-hint");

  if (hint !== null) hint.hidden = !step.hint;
}

export function fitBar(bar: HTMLElement, steps: readonly [BarStep, ...BarStep[]]): BarStep {
  let chosen = steps[0];

  applyStep(bar, chosen);

  for (const step of steps.slice(1)) {
    if (!barOverflows(bar)) break;

    chosen = step;
    applyStep(bar, chosen);
  }

  return chosen;
}
