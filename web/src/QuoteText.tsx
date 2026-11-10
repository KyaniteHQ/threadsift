import type { ReactNode } from "react";

import { STORED_PICTURE_TEXT } from "../../src/core/reader-url.ts";
import { Icon } from "./Icon.tsx";
import { PICTURE_LABEL } from "./reader-text.ts";

function Picture() {
  return (
    <span className="quote-pic">
      <Icon name="picture" className="ic ic-s" label={PICTURE_LABEL} />
    </span>
  );
}

export function QuoteText({ text }: Readonly<{ text: string }>): ReactNode {
  const nodes: ReactNode[] = [];
  let offset = 0;

  for (const words of text.split(STORED_PICTURE_TEXT)) {
    if (offset > 0) nodes.push(<Picture key={offset} />);

    nodes.push(words);
    offset += words.length + 1;
  }

  return nodes;
}
