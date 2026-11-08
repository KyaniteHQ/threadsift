export const BAR_FONTS = ["--f-display", "--f-ui"] as const;
export const SECTION_FONTS = [...BAR_FONTS, "--f-mono"] as const;
export const LOOK_FONTS = [...SECTION_FONTS, "--f-read"] as const;

const WEIGHTS = [400, 500, 600] as const;
const SAMPLE = "Aa";

export function stacksOf(root: HTMLElement, variables: readonly string[]): string[] {
  const style = getComputedStyle(root);

  return variables.map((variable) => style.getPropertyValue(variable));
}

export async function loadStacks(stacks: readonly string[], signal: AbortSignal): Promise<void> {
  const loads = stacks.flatMap((stack) =>
    WEIGHTS.map((weight) => document.fonts.load(`${weight} 1em ${stack}`, SAMPLE)),
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
): Promise<void> {
  return loadStacks(stacksOf(root, variables), signal);
}
