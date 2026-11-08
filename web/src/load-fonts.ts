export const BAR_FONTS = ["--f-display", "--f-ui"] as const;
export const SECTION_FONTS = [...BAR_FONTS, "--f-mono"] as const;

const WEIGHTS = [400, 500, 600] as const;
const SAMPLE = "Aa";

export async function loadFonts(
  root: HTMLElement,
  stacks: readonly string[],
  signal: AbortSignal,
): Promise<void> {
  const style = getComputedStyle(root);

  const loads = stacks.flatMap((stack) =>
    WEIGHTS.map((weight) =>
      document.fonts.load(`${weight} 1em ${style.getPropertyValue(stack)}`, SAMPLE),
    ),
  );

  const given = new Promise<void>((resolve) => {
    signal.addEventListener("abort", () => {
      resolve();
    });
  });

  await Promise.race([Promise.allSettled(loads), given]);
}
