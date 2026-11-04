/* oxlint-disable max-lines-per-function, unicorn/consistent-function-scoping -- page.evaluate serialises this one function, so its helpers must sit inside it */
export function collectViolations(): string[] {
  const TEXT = 4.5;
  const MARK = 3;
  const FLOOR = 12;
  const TARGET = 44;
  const found: string[] = [];
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (context === null) {
    return ["no 2d canvas to resolve colours"];
  }

  const rgba = (css: string): number[] => {
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = "#000";
    context.fillStyle = css;
    context.fillRect(0, 0, 1, 1);
    const [r = 0, g = 0, b = 0, a = 0] = context.getImageData(0, 0, 1, 1).data;

    return [r, g, b, a / 255];
  };

  const over = (top: number[], below: number[]): number[] => {
    const alpha = top[3] ?? 1;

    return [0, 1, 2].map((i) => (top[i] ?? 0) * alpha + (below[i] ?? 0) * (1 - alpha)).concat([1]);
  };

  const backdrop = (element: Element | null): number[] => {
    const layers: number[][] = [];

    for (let node = element; node !== null; node = node.parentElement) {
      const layer = rgba(getComputedStyle(node).backgroundColor);

      if ((layer[3] ?? 0) > 0) {
        layers.push(layer);
      }

      if (layer[3] === 1) {
        break;
      }
    }

    return layers.reduceRight((below, layer) => over(layer, below), [255, 255, 255, 1]);
  };

  const luminance = (color: number[]): number => {
    const [r = 0, g = 0, b = 0] = color.slice(0, 3).map((channel) => {
      const value = channel / 255;

      return value <= 0.039_28 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });

    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  const ratio = (a: number[], b: number[]): number => {
    const [light = 0, dark = 0] = [luminance(a), luminance(b)].toSorted((x, y) => y - x);

    return (light + 0.05) / (dark + 0.05);
  };

  const name = (element: Element): string =>
    `${element.tagName.toLowerCase()}.${element.className} "${(element.textContent ?? "").trim().slice(0, 30)}"`;

  const visible = (element: Element): boolean => {
    const box = element.getBoundingClientRect();

    return box.width > 0 && box.height > 0 && element.closest(".vh") === null;
  };

  const checkRatio = (what: string, fg: number[], bg: number[], least: number): void => {
    const value = ratio(over(fg, bg), bg);

    if (value < least) {
      found.push(`${what}: ${value.toFixed(2)}:1, needs ${least}:1`);
    }
  };

  for (const element of document.querySelectorAll(".app *")) {
    const ownText = [...element.childNodes].some(
      (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim() !== "",
    );

    if (ownText && visible(element)) {
      const style = getComputedStyle(element);
      checkRatio(`text ${name(element)}`, rgba(style.color), backdrop(element), TEXT);

      if (Number(style.fontSize) < FLOOR) {
        found.push(`text ${name(element)}: ${style.fontSize} is under ${FLOOR}px`);
      }
    }
  }

  for (const input of document.querySelectorAll(".app input")) {
    const placeholder = getComputedStyle(input, "::placeholder");
    checkRatio("placeholder", rgba(placeholder.color), backdrop(input), TEXT);
  }

  for (const field of document.querySelectorAll(".app .field")) {
    const border = rgba(getComputedStyle(field).borderTopColor);
    checkRatio("field border against the page", border, backdrop(field.parentElement), MARK);
    checkRatio("field border against the field", border, backdrop(field), MARK);
  }

  for (const button of document.querySelectorAll(".app .btn")) {
    const style = getComputedStyle(button);

    const edge = rgba(
      button.classList.contains("btn-acc") ? style.backgroundColor : style.borderTopColor,
    );

    checkRatio(`button edge ${name(button)}`, edge, backdrop(button.parentElement), MARK);
  }

  for (const icon of document.querySelectorAll(".app svg.ic")) {
    checkRatio("icon", rgba(getComputedStyle(icon).color), backdrop(icon), MARK);
  }

  for (const row of document.querySelectorAll(".app .it.open")) {
    const bar = rgba(getComputedStyle(row).getPropertyValue("--acc"));
    checkRatio("open row bar against its tint", bar, backdrop(row), MARK);
  }

  if (innerWidth < 480) {
    for (const target of document.querySelectorAll(".app button, .app input, .app a[href]")) {
      const box = (target.closest(".it") ?? target).getBoundingClientRect();

      if (Math.min(box.width, box.height) < TARGET - 0.5) {
        found.push(`target ${name(target)}: ${box.width}x${box.height} is under ${TARGET}px`);
      }
    }
  }

  const scrollers = [
    document.documentElement,
    ...document.querySelectorAll(".app, .lib, .mast, .list"),
  ];

  for (const scroller of scrollers) {
    if (scroller.scrollWidth > scroller.clientWidth + 1) {
      found.push(`${name(scroller)} scrolls sideways`);
    }
  }

  if (document.documentElement.scrollHeight > innerHeight + 1) {
    found.push("the page itself scrolls vertically");
  }

  return found;
}
