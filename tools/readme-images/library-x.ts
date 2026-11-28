import type { SeedItem } from "./seed-types.ts";
import { xThread } from "./seed-wire.ts";

const LOCAL_FIRST = xThread({
  id: "3000000000000000222",
  author: "mirela_ships_things",
  text: "Shipped a local-first notes app to about 2,000 people this year. A few things I did not expect.",
  replies: [
    {
      id: "3000000000000000223",
      parentId: "3000000000000000222",
      author: "mirela_ships_things",
      text: "1/ Sync was not the hard part. Conflicts were. Nearly all of them were one note edited on two devices while both were offline.",
      likes: 142,
    },
    {
      id: "3000000000000000224",
      parentId: "3000000000000000223",
      author: "mirela_ships_things",
      text: "2/ People do not want a clever merge. They want to see both versions and pick one. Support mail about lost edits dropped to nearly zero.",
      likes: 118,
    },
    {
      id: "3000000000000000225",
      parentId: "3000000000000000222",
      author: "ohm_and_order_blog",
      text: "Clock drift bit us too. We moved from timestamps to a counter per device and the odd merges went away.",
      likes: 63,
    },
  ],
});

const HYPHEN = xThread({
  id: "3000000000000000333",
  author: "kern_and_lead_press",
  text: "A narrow column needs hyphenation more than a wide one. Turn it on, set a minimum of three letters before and after the break, and read the result aloud once.",
  quoted: [
    {
      id: "3000000000000000300",
      author: "paperjam_dev_studio",
      text: "Our blog column is 38 characters wide on a phone and the gaps between words look like rivers.",
    },
  ],
  replies: [
    {
      id: "3000000000000000334",
      parentId: "3000000000000000333",
      author: "kern_and_lead_press",
      text: "The CSS is `hyphens: auto` plus the right `lang` attribute on the page. Without `lang`, the browser has no dictionary and does nothing.",
      likes: 77,
    },
  ],
});

export const X_ITEMS: readonly SeedItem[] = [
  {
    key: "local-first",
    url: "https://x.com/mirela_ships_things/status/3000000000000000222",
    content: LOCAL_FIRST,
    digest: {
      title: "What I learned shipping a local-first notes app to 2,000 people",
      topic: "Local-first software",
      tags: ["sync", "conflicts"],
      summary:
        "Conflicts, not sync, were the hard part of a local-first notes app.\nShowing both versions of a note cut support mail about lost edits.",
      keyPoints: [
        "Most conflicts were one note edited offline on two devices.",
        "A counter per device replaced timestamps and ended the odd merges.",
      ],
      keptComments: ["3000000000000000225"],
    },
  },
  {
    key: "hyphens",
    url: "https://x.com/kern_and_lead_press/status/3000000000000000333",
    content: HYPHEN,
    digest: {
      title: "Hyphenation helps a narrow column more than a wide one",
      topic: "Typography",
      tags: ["hyphenation", "measure"],
      summary:
        "A narrow column leaves rivers of white space unless the text hyphenates.\nThe CSS needs `hyphens: auto` and a `lang` attribute on the page.",
      keyPoints: [
        "Break after at least three letters and before at least three.",
        "Without a `lang` attribute the browser has no dictionary.",
      ],
    },
  },
];
