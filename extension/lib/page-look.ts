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

export function button(label: string, onClick: () => void): HTMLButtonElement {
  const created = element("button", { type: "button", class: "btn btn-acc" }, label);
  created.addEventListener("click", onClick);

  return created;
}

export type Tone = "ok" | "warn" | "plain";

export function say(target: HTMLElement, text: string, tone: Tone): void {
  target.textContent = text;
  target.dataset["tone"] = tone;
}

export function replaceControls(
  container: HTMLElement,
  heading: HTMLElement,
  controls: readonly HTMLElement[],
): void {
  const lostFocus = container.contains(document.activeElement);

  container.replaceChildren(...controls);

  if (lostFocus) heading.focus();
}
