import { type PlacedSelector, selectorAt, unitIndexAt } from "../../src/core/highlight-anchor.ts";
import type { HighlightTarget } from "../../src/core/highlight-contract.ts";
import { projectDom } from "./dom-projection.ts";
import { BODY_SELECTOR, targetOfKey } from "./highlight-target.ts";

export interface SelectionDraft {
  readonly target: HighlightTarget;
  readonly selector: PlacedSelector;
  readonly range: Range;
}

function bodyOf(node: Node): HTMLElement | null {
  const element = node instanceof Element ? node : node.parentElement;

  return element?.closest<HTMLElement>(BODY_SELECTOR) ?? null;
}

function insideControl(body: Element, range: Range): boolean {
  return Array.from(body.querySelectorAll("button")).some((button) => range.intersectsNode(button));
}

function trimmed(text: string, start: number, end: number) {
  const chosen = text.slice(
    unitIndexAt(text, start) ?? text.length,
    unitIndexAt(text, end) ?? text.length,
  );

  const lead = chosen.length - chosen.trimStart().length;
  const trail = chosen.length - chosen.trimEnd().length;

  return { from: start + lead, to: end - trail };
}

export function draftOf(selection: Selection): SelectionDraft | null {
  if (selection.rangeCount !== 1 || selection.isCollapsed) return null;

  const range = selection.getRangeAt(0);
  const body = bodyOf(range.startContainer);

  if (body === null || body !== bodyOf(range.endContainer) || insideControl(body, range)) {
    return null;
  }

  const target = targetOfKey(body.dataset["target"] ?? "");
  const projection = projectDom(body);
  const span = projection.spanOf(range);

  if (target === null || span === null) return null;

  const { from, to } = trimmed(projection.text, span.start, span.end);
  const selector = from < to ? selectorAt(projection.text, from, to - from) : null;

  return selector === null ? null : { target, selector, range: range.cloneRange() };
}
