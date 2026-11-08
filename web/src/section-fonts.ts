const STACKS = ["--f-display", "--f-ui", "--f-mono"] as const;
const WEIGHTS = [400, 500, 600] as const;
const SAMPLE = "Aa";

export async function loadSectionFonts(page: HTMLElement, signal: AbortSignal): Promise<void> {
  const style = getComputedStyle(page);

  const loads = STACKS.flatMap((stack) =>
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
