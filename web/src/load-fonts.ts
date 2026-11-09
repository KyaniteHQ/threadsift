export const BAR_FONTS = ["--f-display", "--f-ui"] as const;
export const SECTION_FONTS = [...BAR_FONTS, "--f-mono"] as const;
export const LOOK_FONTS = [...SECTION_FONTS, "--f-read"] as const;

export const FACE_WAIT_MS = 3_000;

const WEIGHTS = [400, 500, 600, 700] as const;
const STYLES = ["normal", "italic"] as const;

export const BASE_SAMPLE = "Aa";

export function sampleOf(json: string): string {
  return [...new Set(BASE_SAMPLE + json)].join("");
}

export function stacksOf(root: HTMLElement, variables: readonly string[]): string[] {
  const style = getComputedStyle(root);

  return variables.map((variable) => style.getPropertyValue(variable));
}

export async function loadStacks(
  stacks: readonly string[],
  signal: AbortSignal,
  sample = BASE_SAMPLE,
): Promise<void> {
  const loads = stacks.flatMap((stack) =>
    STYLES.flatMap((style) =>
      WEIGHTS.map((weight) => document.fonts.load(`${style} ${weight} 1em ${stack}`, sample)),
    ),
  );

  const given = new Promise<void>((resolve) => {
    signal.addEventListener("abort", () => {
      resolve();
    });
  });

  await Promise.race([Promise.allSettled(loads), given]);
}

export function loadFonts(
  root: HTMLElement,
  variables: readonly string[],
  signal: AbortSignal,
  sample = BASE_SAMPLE,
): Promise<void> {
  return loadStacks(stacksOf(root, variables), signal, sample);
}
