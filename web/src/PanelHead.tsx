import { Icon } from "./Icon.tsx";
import { CLOSE_LABEL } from "./text.ts";

export function PanelHead({
  modal,
  titleId,
  title,
  close,
}: Readonly<{ modal: boolean; titleId: string; title: string; close: () => void }>) {
  return modal ? (
    <div className="st-head">
      <h2 className="st-title" id={titleId}>
        {title}
      </h2>
      <button
        type="button"
        className="st-close"
        data-focus-key="close"
        aria-label={CLOSE_LABEL}
        onClick={close}
      >
        <Icon name="close" className="ic" />
      </button>
    </div>
  ) : (
    <h2 className="vh" id={titleId}>
      {title}
    </h2>
  );
}
