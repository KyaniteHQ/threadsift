import "../../design/system/tokens.css";
import "../../design/system/components.css";
import "../entrypoints/pages.css";
import { DARK_SCHEME } from "../../design/system/settings.ts";

export function applyLook(): void {
  document.documentElement.dataset["theme"] = matchMedia(DARK_SCHEME).matches ? "dark" : "light";
}

export function element<Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  attributes: Readonly<Record<string, string>>,
  ...children: readonly (Element | string)[]
): HTMLElementTagNameMap[Tag] {
  const created = document.createElement(tag);

  for (const [name, value] of Object.entries(attributes)) created.setAttribute(name, value);

  created.append(...children);

  return created;
}
