import { useId, useRef } from "react";

import { useSidewaysFade } from "./scroll-fades.ts";
import { COMMAND_LABEL } from "./text.ts";

export function Command({ text }: Readonly<{ text: string }>) {
  const box = useRef<HTMLDivElement>(null);
  const id = useId();

  useSidewaysFade(box);

  return (
    <div ref={box} className="sxw cmd-w">
      <span id={`${id}-label`} hidden>
        {COMMAND_LABEL}
      </span>
      <pre className="cmd sx" data-labelledby={`${id}-label ${id}-text`}>
        <code id={`${id}-text`}>{text}</code>
      </pre>
    </div>
  );
}
