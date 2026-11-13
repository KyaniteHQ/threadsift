import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { z } from "zod";

import { type Judgement, type Resolved, judged, oembedAnswerOf } from "../src/core/x-oembed.ts";

const AnswerSchema = z.looseObject({ url: z.string(), author_url: z.string(), html: z.string() });

export const CUT_BARE_ID = "3100000000000000011";

export const recorded = (name: string) =>
  readFileSync(new URL(`x-oembed/${name}`, import.meta.url), "utf8");

export const postOf = (name: string) => {
  const answer = oembedAnswerOf(200, recorded(name));

  assert.equal(answer.kind, "post", name);

  if (answer.kind !== "post") throw new Error(name);

  return answer.post;
};

export const answerJson = (name: string) => AnswerSchema.parse(JSON.parse(recorded(name)));

export const withParagraph = (name: string, html: string): string =>
  JSON.stringify({ ...answerJson(name), html: `<blockquote><p>${html}</p></blockquote>` });

export const NOTHING_RESOLVED: Resolved = new Map();

export const verdict = (
  name: string,
  id: string,
  author: string,
  text: string,
  resolved: Resolved = NOTHING_RESOLVED,
): Judgement => judged({ id, author, text }, postOf(name), resolved);

export const CUT_BARE_HEAD =
  "Libraries should always be open to the whole neighbourhood.\n\nThe committee is against the notion that it would be acceptable for readers to be reduced to a role of doing things that “the schedule thinks makes sense to reward in members”.\n\nPeople should not cede control of the reading room to";

export const CUT_MEDIA_ID = "3100000000000000031";

export const WHOLE_LINKS =
  "Earlier this week Dana published her favourite reading lists:https://t.co/Ww1Ab6Cc4H\nWhich looked excellent so I had to turn it into ShelfTown:https://t.co/Ww2Ab6Cc4I\n47K small book notes +quiet mode for slow evenings. (One-shotted with a script in 3 minutes) https://t.co/Ww3Ab6Cc4J";

export const BAND_ID = "3100000000000000015";

export const REPLY_SHORT =
  "Nice to see the cancellation terms stated up front instead of in a footnote.";

export const REPLY_LONG =
  "My package was held at the depot without a stated reason. I use this address daily for my shop and personal orders. I believe this hold was an error by an automated system. Could you please look at my parcel as soon as possible? I really need it delivered this week.";

export const ARABIC =
  "ما هذا الذي يحدث في الميدان اليوم؟ لماذا أُغلق الطريق بينما بقيت الأخرى مفتوحة بالكامل؟";

export const JAPANESE =
  "今日はご視聴ありがとうございました♪\n明日は新しい企画をやりたいなの気持ちです！\n\nおたのしみに～🌸";

export const BAND_TEXT =
  "ready for the weekend \n\n“blue & loud” out now\n\nhttps://northpier.example/BlueAndLoud\n\n#NORTHPIER #blueandloud";

export const CUT_MEDIA_HEAD =
  "Weekend hack: ShelfTube. I was annoyed with the recommendations so I had a script filter down 43M comments over 20 years of a forum to 6,454 videos that keep being recommended. *Significantly* better viewing, ~2 hours of work:https://t.co/Kk2Ab6Cc4D\n\n- Excellent";

export const CUT_LINK_ID = "3100000000000000033";

export const CUT_LINK_HEAD =
  "Okay it works, I can now upload a video or some photos or just a floor plan of my living room\n\nAnd then:\n- empty it fully\n- move around furniture\n- remove furniture\n- paint the walls, floor, ceiling and any object in any color\n\nNext:\n- top down floor plan view\n- change to any";

export const TWO_LINKS_ID = "3100000000000000034";

export const TWO_LINKS_HEAD =
  "Two reading lists for the winter:https://t.co/Tt1Ab6Cc4O and the follow-up with notes on every title:https://t.co/Tt2Ab6Cc4P\n\nThe short version: start with the first, keep the second beside it, and skip anything that needs a long setup before the third page. More below, with";

export const BAND_LINK = "https://t.co/Bb1Ab6Cc4K";

export const BAND_RESOLVED: Resolved = new Map([
  [BAND_LINK, "https://northpier.example/BlueAndLoud"],
]);

export const BAND = (text: string, resolved = BAND_RESOLVED) =>
  verdict("link-and-hashtags.json", BAND_ID, "NorthPierBand", text, resolved);

export const SHORT = (text: string) =>
  verdict("reply-short.json", "3100000000000000016", "quiet_reader", text);

export const typed = (text: string) =>
  verdict("typed-ellipsis.json", "3100000000000000023", "CatboyDemo", text);

export const MEDIA_ID = "3100000000000000022";

export const verdictOf = (body: string, id: string, author: string, text: string): Judgement => {
  const answer = oembedAnswerOf(200, body);

  if (answer.kind !== "post") throw new Error(answer.kind);

  return judged({ id, author, text }, answer.post, NOTHING_RESOLVED);
};

export const mediaOnly = (text: string) =>
  verdict("reply-media-only.json", MEDIA_ID, "mossy_reply", text);
