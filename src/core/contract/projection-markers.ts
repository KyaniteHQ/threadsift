import { find, html } from "property-information";

export const FOOTNOTE_LABEL_ID = "footnote-label";

export const FOOTNOTE_REF_PROPERTY = "dataFootnoteRef";

export const FOOTNOTE_BACKREF_PROPERTY = "dataFootnoteBackref";

export const FOOTNOTE_REF = find(html, FOOTNOTE_REF_PROPERTY).attribute;

export const FOOTNOTE_BACKREF = find(html, FOOTNOTE_BACKREF_PROPERTY).attribute;

export const FOOTNOTE_LABEL = "data-footnote-label";

export const FAILED_PICTURE = "data-failed-picture";

export const TASK_BOX = "data-task-box";

export interface GeneratedProperties {
  readonly id?: unknown;
  readonly [FOOTNOTE_REF_PROPERTY]?: unknown;
  readonly [FOOTNOTE_BACKREF_PROPERTY]?: unknown;
}

export function isGenerated({
  tagName,
  properties,
}: Readonly<{ tagName?: string; properties?: GeneratedProperties }>): boolean {
  if (tagName === "a") {
    return (
      properties?.[FOOTNOTE_REF_PROPERTY] !== undefined ||
      properties?.[FOOTNOTE_BACKREF_PROPERTY] !== undefined
    );
  }

  return tagName === "h2" && properties?.id === FOOTNOTE_LABEL_ID;
}
