import { useRef } from "react";

import { useSidewaysFade } from "./scroll-fades.ts";
import { COMMAND_LABEL } from "./text.ts";

export function Command({ text }: Readonly<{ text: string }>) {
  const box = useRef<HTMLDivElement>(null);

  useSidewaysFade(box);

  return (
    <div ref={box} className="sxw cmd-w">
      <pre className="cmd sx" data-label={COMMAND_LABEL}>
        <code>{text}</code>
      </pre>
    </div>
  );
}
