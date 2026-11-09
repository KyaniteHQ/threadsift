import { type APIRequestContext } from "@playwright/test";
import { expect } from "@playwright/test";

import { type Instance, launchFresh, newCode } from "./access.ts";
import { pasteLive } from "./articles.ts";
import { ownerOf } from "./files.ts";
import { attachSnapshot } from "./media-evidence.ts";

const DEFUDDLE_FIXTURES =
  "https://rawcdn.githack.com/kepano/defuddle/3e8bde9f5f855bc968e95837a750c5968a9fe639/tests/fixtures";

export const RESPONSIVE_PAGE = "https://web.dev/articles/responsive-images";

export const SHARED_WIDTHS_PAGE =
  "https://css-tricks.com/a-guide-to-the-responsive-images-syntax-in-html/";

export const RESPONSIVE_SVG = "html5-logo-svg-format-550784ff36e4b.svg";

export const LAZY_VIDEO_PAGE = "https://tonsky.me/blog/unicode/";
export const LAZY_VIDEO = "https://tonsky.me/blog/unicode/intellij@2x.mp4?t=1695726809";

export const EMBED_PAGE = "https://blog.codinghorror.com/you-cant-vibe-code-love/";
export const EMBED_LINK = "https://www.youtube.com/watch?v=j7x0BTwfn_I";

export const OVERSIZED_PAGE =
  "https://en.wikipedia.org/w/index.php?title=Mandelbrot_set&oldid=1378299469";

export const OVERSIZED_IMAGE = "Mandelbrot_sequence_new.gif";
export const LARGE_IMAGE = "Logistic_Map_Bifurcations_Underneath_Mandelbrot_Set.gif";

export const REPEATED_PAGE =
  "https://en.wikipedia.org/w/index.php?title=2019_FIFA_Women%27s_World_Cup_Group_A&oldid=1382208828";

export const REPEATED_IMAGE = "Kit_body.svg/40px-Kit_body.svg.png";

export const FAILING_PAGE = `${DEFUDDLE_FIXTURES}/elements--svg-placeholder-lazy-image.html`;
export const FAILING_IMAGES = 4;

export const MIXED_PAGE = `${DEFUDDLE_FIXTURES}/footnotes--maggieappleton.com-xanadu-patterns.html`;

export const MIXED_FAILED_IMAGE =
  "https://rawcdn.githack.com/_astro/patterns.D8-ibnKY_Z2ngng6.webp";

export const INLINE_PAGE = `${DEFUDDLE_FIXTURES}/general--www.figma.com-blog-introducing-codex-to-figma.html`;

export const RELATIVE_BOOK = "https://www.gutenberg.org/cache/epub/135/pg135-images.html";

export const SMALL_PAGE = "https://martinfowler.com/articles/microservices.html";
export const SMALL_PAGE_IMAGES = 7;

export const OTHER_PAGE = "https://example.com/";

export const NO_IMAGE_PAGE = "https://stephango.com/saw";

export const FAILING_FETCH_PAGE = "https://web.dev/learn/css/images";

export interface Library {
  readonly instance: Instance;
  readonly owner: APIRequestContext;
}

export async function openLibrary(): Promise<Library> {
  const code = newCode();
  const instance = launchFresh(code);

  return { instance, owner: await ownerOf(instance, code, "c".repeat(20)) };
}

export async function closeLibrary({ instance, owner }: Readonly<Library>): Promise<void> {
  try {
    await attachSnapshot(instance);
  } finally {
    await owner.dispose();
    instance.stop();
  }
}

export async function pasteArticle(owner: APIRequestContext, name: string, url: string) {
  const { last } = await pasteLive(owner, { name, url });

  expect(last.item).toMatchObject({ source: "article", kind: "article", fetch: "ok" });

  return last.item;
}

export function repoint(instance: Instance, id: number, url: string): void {
  instance.sql(
    `UPDATE items SET normalized_url = '${url}', original_url = '${url}' WHERE id = ${id}`,
  );
}
