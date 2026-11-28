import {
  type Pane,
  type PaneBounds,
  type Room,
  type Widths,
  type PaneRange,
  drawnWidths,
  rangeOf,
  readBounds,
  saveWidths,
  savedWidths,
  widthOf,
} from "./pane-widths.ts";

const STEP = 16;
const SHIFT_STEP = 64;
const PANES = ["rail", "list"] as const;
const WIDTH_TOKENS: Readonly<Record<Pane, string>> = { rail: "--rail-w", list: "--list-w" };
const NO_WIDTHS: Widths = { rail: 0, list: 0 };

type Drag =
  | { readonly kind: "idle" }
  | {
      readonly kind: "dragging";
      readonly pane: Pane;
      readonly pointerId: number;
      readonly startWidth: number;
      readonly startX: number;
      readonly startSaved: number;
    };

const IDLE: Drag = { kind: "idle" };

type PointerType =
  | "pointerdown"
  | "pointermove"
  | "pointerup"
  | "pointercancel"
  | "lostpointercapture";

interface Mounted {
  readonly lib: HTMLElement;
  readonly app: HTMLElement;
  readonly bounds: PaneBounds;
}

function keyedWidth(event: KeyboardEvent, now: number, range: PaneRange) {
  const step = event.shiftKey ? SHIFT_STEP : STEP;

  switch (event.key) {
    case "ArrowLeft":
      return now - step;
    case "ArrowRight":
      return now + step;
    case "Home":
      return range.min;
    case "End":
      return range.max;
    default:
      return null;
  }
}

export class PaneSplits {
  readonly #handles = new Map<Pane, HTMLElement>();
  #mounted: Mounted | null = null;
  #saved = NO_WIDTHS;
  #drawn = NO_WIDTHS;
  #drag: Drag = IDLE;
  #wanted: number | null = null;
  #frame = 0;

  readonly #onEscape = (event: KeyboardEvent): void => {
    const drag = this.#drag;

    if (event.key !== "Escape" || drag.kind !== "dragging") return;

    event.preventDefault();
    event.stopPropagation();
    this.#wanted = null;
    this.#saved = { ...this.#saved, [drag.pane]: drag.startSaved };
    this.#end();
  };

  readonly #onBlur = (): void => {
    this.#end();
  };

  mount(lib: HTMLElement): () => void {
    const app = lib.closest<HTMLElement>(".app");
    const bounds = readBounds();

    if (app === null || bounds === null) return () => {};

    this.#mounted = { lib, app, bounds };
    this.#saved = savedWidths(bounds);
    this.#apply();
    const observer = new ResizeObserver(() => {
      this.#apply();
    });
    observer.observe(lib);

    return () => {
      this.#end();
      observer.disconnect();
      app.style.removeProperty(WIDTH_TOKENS.rail);
      app.style.removeProperty(WIDTH_TOKENS.list);
      this.#mounted = null;
    };
  }

  attach(handle: HTMLElement, pane: Pane): () => void {
    const down = (event: PointerEvent): void => {
      this.#start(handle, pane, event);
    };
    const move = (event: PointerEvent): void => {
      this.#move(event);
    };
    const release = (event: PointerEvent): void => {
      this.#release(event);
    };
    const key = (event: KeyboardEvent): void => {
      this.#press(pane, event);
    };
    const reset = (): void => {
      this.#reset(pane);
    };
    const pointers: readonly (readonly [PointerType, (event: PointerEvent) => void])[] = [
      ["pointerdown", down],
      ["pointermove", move],
      ["pointerup", release],
      ["pointercancel", release],
      ["lostpointercapture", release],
    ];

    for (const [type, listener] of pointers) handle.addEventListener(type, listener);

    handle.addEventListener("keydown", key);
    handle.addEventListener("dblclick", reset);
    this.#handles.set(pane, handle);
    this.#apply();

    return () => {
      if (this.#drag.kind === "dragging" && this.#drag.pane === pane) this.#end();

      for (const [type, listener] of pointers) handle.removeEventListener(type, listener);

      handle.removeEventListener("keydown", key);
      handle.removeEventListener("dblclick", reset);
      this.#handles.delete(pane);
      this.#apply();
    };
  }

  #room(lib: HTMLElement): Room {
    return { width: lib.clientWidth, rail: this.#handles.has("rail") };
  }

  #apply(): void {
    if (this.#mounted === null) return;

    const { lib, app, bounds } = this.#mounted;
    const room = this.#room(lib);
    const drawn = drawnWidths(this.#saved, bounds, room);
    this.#drawn = drawn;

    for (const pane of PANES) {
      app.style.setProperty(WIDTH_TOKENS[pane], `${String(drawn[pane])}px`);
      const handle = this.#handles.get(pane);
      const range = rangeOf(pane, bounds, room, drawn);
      handle?.setAttribute("aria-valuenow", String(drawn[pane]));
      handle?.setAttribute("aria-valuemin", String(range.min));
      handle?.setAttribute("aria-valuemax", String(range.max));
    }
  }

  #choose(pane: Pane, width: number): void {
    if (this.#mounted === null) return;

    const { lib, bounds } = this.#mounted;
    const chosen = widthOf(pane, width, bounds, this.#room(lib), this.#drawn);
    this.#saved = { ...this.#saved, [pane]: chosen };
    this.#apply();
  }

  #flush(): void {
    cancelAnimationFrame(this.#frame);
    this.#frame = 0;

    if (this.#drag.kind === "dragging" && this.#wanted !== null) {
      this.#choose(this.#drag.pane, this.#wanted);
    }

    this.#wanted = null;
  }

  #start(handle: HTMLElement, pane: Pane, event: PointerEvent): void {
    if (event.button !== 0 || this.#drag.kind !== "idle" || this.#mounted === null) return;

    handle.setPointerCapture(event.pointerId);
    this.#drag = {
      kind: "dragging",
      pane,
      pointerId: event.pointerId,
      startWidth: this.#drawn[pane],
      startX: event.clientX,
      startSaved: this.#saved[pane],
    };
    handle.dataset["active"] = "";
    this.#mounted.app.dataset["resizing"] = pane;
    window.addEventListener("keydown", this.#onEscape, true);
    window.addEventListener("blur", this.#onBlur);
  }

  #move(event: PointerEvent): void {
    const drag = this.#drag;

    if (drag.kind !== "dragging" || event.pointerId !== drag.pointerId) return;

    this.#wanted = drag.startWidth + event.clientX - drag.startX;

    if (this.#frame === 0) {
      this.#frame = requestAnimationFrame(() => {
        this.#frame = 0;
        this.#flush();
      });
    }
  }

  #release(event: PointerEvent): void {
    if (this.#drag.kind === "dragging" && event.pointerId === this.#drag.pointerId) this.#end();
  }

  #end(): void {
    const drag = this.#drag;

    if (drag.kind !== "dragging") return;

    this.#flush();
    this.#drag = IDLE;
    const handle = this.#handles.get(drag.pane);

    if (handle?.hasPointerCapture(drag.pointerId) === true) {
      handle.releasePointerCapture(drag.pointerId);
    }

    delete handle?.dataset["active"];
    window.removeEventListener("keydown", this.#onEscape, true);
    window.removeEventListener("blur", this.#onBlur);

    if (this.#mounted !== null) {
      delete this.#mounted.app.dataset["resizing"];
      this.#apply();
      saveWidths(this.#saved);
    }
  }

  #press(pane: Pane, event: KeyboardEvent): void {
    const modified = event.altKey || event.ctrlKey || event.metaKey;

    if (this.#mounted === null || this.#drag.kind === "dragging" || modified) return;

    if (event.key === "Enter") {
      event.preventDefault();
      this.#reset(pane);

      return;
    }

    const { bounds, lib } = this.#mounted;
    const range = rangeOf(pane, bounds, this.#room(lib), this.#drawn);
    const width = keyedWidth(event, this.#drawn[pane], range);

    if (width === null) return;

    event.preventDefault();
    this.#choose(pane, width);
    saveWidths(this.#saved);
  }

  #reset(pane: Pane): void {
    if (this.#mounted === null || this.#drag.kind === "dragging") return;

    this.#saved = { ...this.#saved, [pane]: this.#mounted.bounds[pane].initial };
    this.#apply();
    saveWidths(this.#saved);
  }
}
