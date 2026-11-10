import { createContext, type ReactNode, use, useCallback, useMemo, useState } from "react";
import { z } from "zod";

import { isImageRouteOf, keyOfFileRoute } from "../../src/core/file-keys.ts";
import type { ImageSize } from "../../src/core/image-size.ts";
import type { SizedImage } from "../../src/http/item-image.ts";
import { Mark } from "./Mark.tsx";
import { Link } from "./ReaderLink.tsx";

export interface Pictures {
  readonly itemId: number;
  readonly sizes: ReadonlyMap<string, ImageSize>;
}

export const PictureScope = createContext<Pictures | null>(null);

export type SizedImages = readonly SizedImage[];

export const NO_IMAGES: SizedImages = [];

export function usePictures(itemId: number | null, images: SizedImages): Pictures | null {
  return useMemo(
    () =>
      itemId === null
        ? null
        : {
            itemId,
            sizes: new Map(images.map(({ url, width, height }) => [url, { width, height }])),
          },
    [itemId, images],
  );
}

interface PictureAttributes {
  readonly src?: string | undefined;
  readonly alt?: string | undefined;
  readonly title?: string | undefined;
  readonly "data-highlights"?: string | undefined;
}

function pictureLabel(href: string, alt: string | undefined): string {
  return alt === undefined || alt === "" ? href : alt;
}

function reservedWidth({ width, height }: Readonly<ImageSize>): string {
  return `min(${width}px, calc(var(--media-max) * ${width} / ${height}))`;
}

function marked(highlights: string | undefined, picture: ReactNode): ReactNode {
  return highlights === undefined ? picture : <Mark data-highlights={highlights}>{picture}</Mark>;
}

function PictureLink({ href, alt }: Readonly<{ href: string; alt: string | undefined }>) {
  const projectedAsPlaceholder = (alt ?? "") === "" && keyOfFileRoute(href) !== null;

  return (
    <Link href={href} data-failed-picture={projectedAsPlaceholder ? "" : undefined}>
      {pictureLabel(href, alt)}
    </Link>
  );
}

function StoredPicture({
  href,
  alt,
  title,
  size,
  "data-highlights": highlights,
}: Readonly<PictureAttributes & { href: string; size: ImageSize | undefined }>) {
  const [failed, setFailed] = useState(false);

  const fail = useCallback(() => {
    setFailed(true);
  }, []);

  const style = useMemo(
    () => (size === undefined ? undefined : { width: reservedWidth(size) }),
    [size],
  );

  if (failed) return marked(highlights, <PictureLink href={href} alt={alt} />);

  return (
    <span className="rd-media">
      {marked(
        highlights,
        <img
          className="pic"
          src={href}
          alt={alt ?? ""}
          title={title}
          width={size?.width}
          height={size?.height}
          style={style}
          loading="lazy"
          decoding="async"
          onError={fail}
        />,
      )}
    </span>
  );
}

export function Picture({
  src,
  alt,
  title,
  "data-highlights": highlights,
}: Readonly<PictureAttributes>) {
  const pictures = use(PictureScope);
  const href = z.string().catch("").parse(src);

  return pictures !== null && isImageRouteOf(href, pictures.itemId) ? (
    <StoredPicture
      key={href}
      href={href}
      alt={alt}
      title={title}
      size={pictures.sizes.get(href)}
      data-highlights={highlights}
    />
  ) : (
    <PictureLink href={href} alt={alt} />
  );
}
