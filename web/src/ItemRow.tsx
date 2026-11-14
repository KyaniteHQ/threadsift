import { type RefObject, memo, useCallback, useEffect, useId, useRef, useState } from "react";

import { itemPath } from "../../src/core/item-path.ts";
import { shownUrl } from "../../src/core/link-place.ts";
import type { Item } from "../../src/http/schemas.ts";
import { Meta, type RowIds, Status, controlName, linkName, rowIds } from "./ItemRowParts.tsx";
import { ROW_MARK_READ, ROW_MARK_UNREAD } from "./reader-text.ts";
import { revealInPane } from "./reveal.ts";
import { useInternalLink } from "./routing.ts";

function rowClasses(item: Readonly<Item>, isOpen: boolean, hasImage: boolean): string {
  return [
    "it",
    ...(hasImage ? [] : ["text-only"]),
    ...(item.readState === "unread" ? ["unread"] : []),
    ...(isOpen ? ["open"] : []),
    ...(item.title === null ? ["it-link-only"] : []),
    ...(item.status === "processing" ? ["it-proc"] : []),
  ].join(" ");
}

function shownImage(item: Readonly<Item>, wanted: boolean, broken: string | null): Item["image"] {
  const { image } = item;

  return wanted && image !== null && image.url !== broken ? image : null;
}

function CardImage({
  image,
  broke,
}: Readonly<{ image: NonNullable<Item["image"]>; broke: (url: string) => void }>) {
  const fail = useCallback(() => {
    broke(image.url);
  }, [broke, image.url]);

  return (
    <div className="it-media">
      <img
        className="pic"
        src={image.url}
        alt={image.alt}
        loading="lazy"
        decoding="async"
        onError={fail}
      />
    </div>
  );
}

export type Attention = Readonly<{ id: number; focus: boolean }> | null;

function useAttention(
  row: RefObject<HTMLElement | null>,
  link: RefObject<HTMLAnchorElement | null>,
  attention: Attention,
  attended: () => void,
) {
  useEffect(() => {
    const element = row.current;

    if (attention !== null && element !== null) {
      const reveal = (): void => {
        revealInPane(element);
      };

      reveal();

      if (attention.focus) {
        link.current?.focus({ preventScroll: true });
      }

      void document.fonts.ready.then(reveal);
      attended();
    }
  }, [attended, attention, link, row]);
}

function ReadDot({
  item,
  ids,
  toggleRead,
}: Readonly<{ item: Item; ids: RowIds; toggleRead: (item: Item) => void }>) {
  const toggle = useCallback(() => {
    toggleRead(item);
  }, [item, toggleRead]);

  const label = item.readState === "unread" ? ROW_MARK_READ : ROW_MARK_UNREAD;

  return (
    <button
      type="button"
      className="it-dot"
      aria-labelledby={controlName(ids.read, ids)}
      aria-keyshortcuts="m"
      onClick={toggle}
    >
      <span id={ids.read} className="vh">
        {label}
      </span>
      <i />
    </button>
  );
}

function RowTitle({
  item,
  ids,
  link,
  isOpen,
  open,
}: Readonly<{
  item: Item;
  ids: RowIds;
  link: RefObject<HTMLAnchorElement | null>;
  isOpen: boolean;
  open: (id: number) => void;
}>) {
  const choose = useInternalLink(
    useCallback(() => {
      open(item.id);
    }, [item.id, open]),
  );

  const title = item.digestTitle ?? item.title;

  return (
    <h2 id={ids.title} className="it-title" aria-labelledby={ids.title}>
      <a
        ref={link}
        id={ids.open}
        className="it-open"
        aria-labelledby={linkName(ids)}
        href={itemPath(item.id)}
        aria-current={isOpen ? "true" : undefined}
        onClick={choose}
      >
        {title === null ? shownUrl(item.normalizedUrl) : <bdi dir="auto">{title}</bdi>}
      </a>
    </h2>
  );
}

export const ItemRow = memo(function ItemRow({
  item,
  now,
  cardImages,
  isOpen,
  attention,
  attended,
  tryAgain,
  open,
  toggleRead,
}: Readonly<{
  item: Item;
  now: number;
  cardImages: boolean;
  isOpen: boolean;
  attention: Attention;
  attended: () => void;
  tryAgain: (item: Item) => void;
  open: (id: number) => void;
  toggleRead: (item: Item) => void;
}>) {
  const row = useRef<HTMLElement>(null);
  const link = useRef<HTMLAnchorElement>(null);
  const ids = rowIds(useId());
  const [broken, setBroken] = useState<string | null>(null);
  const image = shownImage(item, cardImages, broken);
  useAttention(row, link, attention, attended);

  return (
    <article ref={row} className={rowClasses(item, isOpen, image !== null)} data-key={item.id}>
      <ReadDot item={item} ids={ids} toggleRead={toggleRead} />
      <Meta item={item} now={now} id={ids.meta} />
      <RowTitle item={item} ids={ids} link={link} isOpen={isOpen} open={open} />
      {image === null ? null : <CardImage image={image} broke={setBroken} />}
      <Status item={item} ids={ids} tryAgain={tryAgain} />
    </article>
  );
});
