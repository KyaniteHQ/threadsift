/* oxlint-disable max-lines-per-function, unicorn/consistent-function-scoping -- page.evaluate serialises this one function, so its helpers must sit inside it */
export function collectViolations(defaultFont: string): string[] {
  const TEXT = 4.5;
  const MARK = 3;
  const FLOOR = 12;
  const TARGET = 44;
  const found: string[] = [];
  const px = (value: string): number => Number(value.replace(/px$/u, ""));
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

      if (px(style.fontSize) < FLOOR) {
        found.push(`text ${name(element)}: ${style.fontSize} is under ${FLOOR}px`);
      }
    }
  }

  for (const input of document.querySelectorAll(".app input[placeholder]")) {
    const placeholder = getComputedStyle(input, "::placeholder");
    checkRatio("placeholder", rgba(placeholder.color), backdrop(input), TEXT);
  }

  for (const field of document.querySelectorAll(".app .field")) {
    const border = rgba(getComputedStyle(field).borderTopColor);
    checkRatio("field border against the page", border, backdrop(field.parentElement), MARK);
    checkRatio("field border against the field", border, backdrop(field), MARK);
  }

  for (const button of document.querySelectorAll(".app .btn:not(.btn-plain), .app .st-reset")) {
    const style = getComputedStyle(button);

    const filled = button.classList.contains("btn-acc") && rgba(style.backgroundColor)[3] !== 0;
    const edge = rgba(filled ? style.backgroundColor : style.borderTopColor);

    checkRatio(`button edge ${name(button)}`, edge, backdrop(button.parentElement), MARK);
  }

  for (const icon of document.querySelectorAll(".app svg.ic")) {
    checkRatio("icon", rgba(getComputedStyle(icon).color), backdrop(icon), MARK);
  }

  for (const select of document.querySelectorAll(".app select")) {
    const style = getComputedStyle(select);
    checkRatio(`select text ${name(select)}`, rgba(style.color), backdrop(select), TEXT);
    checkRatio("select edge", rgba(style.borderTopColor), backdrop(select.parentElement), MARK);

    if (px(style.fontSize) < FLOOR) {
      found.push(`select ${name(select)}: ${style.fontSize} is under ${FLOOR}px`);
    }
  }

  for (const swatch of document.querySelectorAll(".app .st-sw")) {
    const style = getComputedStyle(swatch);
    const label = swatch.querySelector("input")?.getAttribute("aria-label");
    const surface = backdrop(swatch.parentElement);
    checkRatio(`swatch ${label}`, rgba(style.backgroundColor), surface, MARK);

    if (swatch.querySelector("input:checked") !== null) {
      checkRatio(`selected swatch ${label} edge`, rgba(style.borderTopColor), surface, MARK);
    }
  }

  for (const pressed of document.querySelectorAll(".app .st-b:has(input:checked)")) {
    const fill = rgba(getComputedStyle(pressed).backgroundColor);
    checkRatio(`selected segment ${name(pressed)}`, fill, backdrop(pressed.parentElement), MARK);
  }

  const family = (value: string): string =>
    value
      .replaceAll(/["']/gu, "")
      .replaceAll(/\s*,\s*/gu, ",")
      .trim();

  const plainFont = document.createElement("div");
  plainFont.dataset["font"] = defaultFont;
  document.querySelector(".app")?.append(plainFont);
  const plainFamily = family(getComputedStyle(plainFont).getPropertyValue("--f-ui"));
  plainFont.remove();

  for (const element of document.querySelectorAll(".st-pop *")) {
    const hasText = [...element.childNodes].some(
      (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim() !== "",
    );

    if ((hasText || element.tagName === "SELECT") && visible(element)) {
      const used = family(getComputedStyle(element).fontFamily);

      if (used !== plainFamily) {
        found.push(
          `panel text ${name(element)}: ${used} is not the default UI font ${plainFamily}`,
        );
      }
    }
  }

  for (const element of document.querySelectorAll(
    ".st-pop :focus-visible, .st-gear:focus-visible",
  )) {
    const ringed = element.closest(".st-b, .st-sw") ?? element;
    const style = getComputedStyle(ringed);
    const box = ringed.getBoundingClientRect();
    const reach = px(style.outlineWidth) + px(style.outlineOffset);

    if (style.outlineStyle === "none") {
      found.push(`focus ring: ${name(element)} draws none`);
    } else {
      checkRatio(
        `focus ring ${name(element)}`,
        rgba(style.outlineColor),
        backdrop(ringed.parentElement),
        MARK,
      );
    }

    for (const clip of [element.closest(".st-body"), element.closest(".st-pop")]) {
      const bounds = clip?.getBoundingClientRect();

      if (
        bounds !== undefined &&
        (box.left - reach < bounds.left ||
          box.right + reach > bounds.right ||
          box.top - reach < bounds.top ||
          box.bottom + reach > bounds.bottom)
      ) {
        found.push(
          `focus ring: ${name(element)} reaches outside ${name(clip ?? element)}, which clips it`,
        );
      }
    }
  }

  for (const row of document.querySelectorAll(".app .it.open")) {
    const bar = rgba(getComputedStyle(row).getPropertyValue("--acc"));
    checkRatio("open row bar against its tint", bar, backdrop(row), MARK);
  }

  for (const row of document.querySelectorAll(".app .it:has(.it-open:focus-visible)")) {
    const style = getComputedStyle(row);
    const reach = px(style.outlineWidth) + px(style.outlineOffset);
    let pane = row.parentElement;

    while (pane !== null && !["auto", "scroll"].includes(getComputedStyle(pane).overflowY)) {
      pane = pane.parentElement;
    }

    const box = row.getBoundingClientRect();
    const bounds = (pane ?? document.documentElement).getBoundingClientRect();

    if (style.outlineStyle === "none") {
      found.push(`focus ring: ${name(row)} draws none`);
    } else if (
      box.left - reach < bounds.left ||
      box.right + reach > bounds.right ||
      box.top - reach < bounds.top
    ) {
      found.push(`focus ring: ${name(row)} reaches outside its scrolling pane, which clips it`);
    }
  }

  const canvasColor = getComputedStyle(document.documentElement).backgroundColor;

  const appColor = getComputedStyle(
    document.querySelector(".app") ?? document.body,
  ).backgroundColor;

  if (canvasColor !== appColor) {
    found.push(`page canvas ${canvasColor} differs from the app background ${appColor}`);
  }

  if (innerWidth < 480) {
    for (const target of document.querySelectorAll(
      ".app button, .app input, .app select, .app a[href]",
    )) {
      const box = (target.closest(".it") ?? target).getBoundingClientRect();
      const drawsNoBox = box.width === 0 && box.height === 0;
      const isHint = target.closest(".vh") !== null;

      if (!drawsNoBox && !isHint && Math.min(box.width, box.height) < TARGET - 0.5) {
        found.push(`target ${name(target)}: ${box.width}x${box.height} is under ${TARGET}px`);
      }
    }
  }

  const scrollers = [
    document.documentElement,
    ...document.querySelectorAll(".app, .lib, .mast, .list, .st-pop, .st-body, .auth, .pg"),
  ];

  const panelIsOpen = document.querySelector(".st-pop") !== null;

  for (const scroller of scrollers) {
    const spills = getComputedStyle(scroller).overflowX === "visible";

    if (scroller !== document.documentElement && spills && panelIsOpen) {
      continue;
    }

    if (scroller.scrollWidth > scroller.clientWidth + 1) {
      found.push(`${name(scroller)} scrolls sideways`);
    }
  }

  const panelBox = document.querySelector(".st-pop")?.getBoundingClientRect();

  if (panelBox !== undefined && (panelBox.left < 0 || panelBox.right > innerWidth + 1)) {
    found.push(
      `the settings panel spans ${panelBox.left} to ${panelBox.right} in a ${innerWidth}px window`,
    );
  }

  if (document.documentElement.scrollHeight > innerHeight + 1) {
    found.push("the page itself scrolls vertically");
  }

  return found;
}
