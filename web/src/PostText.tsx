import { type ComponentProps, memo, useEffect, useId, useMemo, useRef } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { readerUrl } from "../../src/core/reader-url.ts";
import { type MarkSpan, markPlugins } from "./highlight-marks.ts";
import { POST_TEXT_COMPONENTS } from "./PostTextComponents.tsx";
import { FOOTNOTES_LABEL, footnoteBackLabel } from "./reader-text.ts";
import { FootnoteScope } from "./ReaderLink.tsx";
import { watchFades } from "./scroll-fades.ts";
import { NO_IMAGES, PictureScope, type SizedImages, usePictures } from "./StoredPicture.tsx";

const PLUGINS = [remarkGfm];

const FOOTNOTES: NonNullable<ComponentProps<typeof Markdown>["remarkRehypeOptions"]> = {
  footnoteLabel: FOOTNOTES_LABEL,
  footnoteBackLabel,
  footnoteLabelProperties: { className: ["vh"] },
};

export const PostText = memo(function PostText({
  text,
  targetKey,
  spans,
  itemId = null,
  images = NO_IMAGES,
}: Readonly<{
  text: string;
  targetKey: string;
  spans: readonly MarkSpan[];
  itemId?: number | null;
  images?: SizedImages;
}>) {
  const root = useRef<HTMLDivElement>(null);
  const scope = useId();

  const pictures = usePictures(itemId, images);

  const options = useMemo(() => ({ ...FOOTNOTES, clobberPrefix: `${scope}-` }), [scope]);
  const rehype = useMemo(() => markPlugins(spans, itemId), [spans, itemId]);

  useEffect(() => (root.current === null ? undefined : watchFades(root.current)), []);

  return (
    <div ref={root} className="md" data-target={targetKey}>
      <FootnoteScope value={scope}>
        <PictureScope value={pictures}>
          <Markdown
            remarkPlugins={PLUGINS}
            rehypePlugins={rehype}
            remarkRehypeOptions={options}
            components={POST_TEXT_COMPONENTS}
            urlTransform={readerUrl}
          >
            {text}
          </Markdown>
        </PictureScope>
      </FootnoteScope>
    </div>
  );
});
