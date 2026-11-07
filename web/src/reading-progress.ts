export function followProgress(slot: HTMLElement, bar: HTMLElement): () => void {
  let frame = 0;

  const set = (): void => {
    frame = 0;
    const range = slot.scrollHeight - slot.clientHeight;
    const fraction = range > 0 ? Math.min(1, Math.max(0, slot.scrollTop / range)) : 0;
    bar.style.setProperty("--progress", fraction.toFixed(4));
  };

  const schedule = (): void => {
    if (frame === 0) frame = requestAnimationFrame(set);
  };

  set();
  slot.addEventListener("scroll", schedule, { passive: true });
  const observer = new ResizeObserver(schedule);
  observer.observe(slot);

  if (slot.firstElementChild !== null) observer.observe(slot.firstElementChild);

  return () => {
    cancelAnimationFrame(frame);
    slot.removeEventListener("scroll", schedule);
    observer.disconnect();
  };
}
