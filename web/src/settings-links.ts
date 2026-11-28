import { OBSIDIAN_TEXT } from "./obsidian-text.ts";
import { OBSIDIAN_PATH } from "./routing.ts";

export type SettingsLink =
  | Readonly<{ kind: "section"; id: string; title: string }>
  | Readonly<{ kind: "page"; path: string; title: string }>;

export function sectionLink({ id, title }: Readonly<{ id: string; title: string }>): SettingsLink {
  return { kind: "section", id, title };
}

export const OBSIDIAN_LINK: SettingsLink = {
  kind: "page",
  path: OBSIDIAN_PATH,
  title: OBSIDIAN_TEXT.title,
};
