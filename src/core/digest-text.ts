import { z } from "zod";

import { isReadableText } from "./plain-text.ts";

export const SHORT_TEXT_MAX = 240;

const LINE_BREAK = /\r\n|\r|\n/u;

const ShortText = z.string().trim().min(1).max(SHORT_TEXT_MAX);

const UNREADABLE = { error: "must not hold a control character or a lone surrogate" };

const ReadableShortText = ShortText.refine(isReadableText, UNREADABLE);

const Summary = z
  .string()
  .trim()
  .min(1)
  .max(1200)
  .refine((text) => text.split(LINE_BREAK).length <= 2, { error: "must have at most two lines" });

const ReadableSummary = Summary.refine(
  (text) => text.split(LINE_BREAK).every((line) => isReadableText(line)),
  UNREADABLE,
);

export const STORED_TEXT = {
  title: ShortText,
  topic: ShortText,
  tags: z.array(ShortText).max(3).readonly(),
  summary: Summary,
};

export const READABLE_TEXT = {
  title: ReadableShortText,
  topic: ReadableShortText,
  tags: z.array(ReadableShortText).max(3).readonly(),
  summary: ReadableSummary,
};
