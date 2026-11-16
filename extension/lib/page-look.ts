import "../../design/system/tokens.css";
import "../../design/system/components.css";
import "../entrypoints/pages.css";
import { DARK_SCHEME } from "../../design/system/settings.ts";

function writeTheme(dark: boolean): void {
  document.documentElement.dataset["theme"] = dark ? "dark" : "light";
}

export function applyLook(): void {
  const query = matchMedia(DARK_SCHEME);

  writeTheme(query.matches);

  query.addEventListener("change", (event) => {
    writeTheme(event.matches);
  });
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

export type Tone = "ok" | "warn" | "plain";

export function say(target: HTMLElement, text: string, tone: Tone): void {
  target.textContent = text;
  target.dataset["tone"] = tone;
}
