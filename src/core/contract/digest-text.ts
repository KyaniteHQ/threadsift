import { z } from "zod";

import { lineBreaksOf } from "./format.ts";
import { isReadableText } from "./plain-text.ts";

export const SHORT_TEXT_MAX = 240;

export const DIGEST_TAGS_MAX = 3;

const ShortText = z.string().trim().min(1).max(SHORT_TEXT_MAX);

const UNREADABLE = { error: "must not hold a control character or a lone surrogate" };

const ReadableShortText = ShortText.refine(isReadableText, UNREADABLE);

const Summary = z
  .string()
  .trim()
  .min(1)
  .max(1200)
  .refine((text) => lineBreaksOf(text).length <= 2, { error: "must have at most two lines" });

const ReadableSummary = Summary.refine(
  (text) => lineBreaksOf(text).every((line) => isReadableText(line)),
  UNREADABLE,
);

export const STORED_TEXT = {
  title: ShortText,
  topic: ShortText,
  tags: z.array(ShortText).max(DIGEST_TAGS_MAX).readonly(),
  summary: Summary,
};

export const READABLE_TEXT = {
  title: ReadableShortText,
  topic: ReadableShortText,
  tags: z.array(ReadableShortText).max(DIGEST_TAGS_MAX).readonly(),
  summary: ReadableSummary,
};
