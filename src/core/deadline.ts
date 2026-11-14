export function within(signal: AbortSignal | undefined, deadline: AbortSignal): AbortSignal {
  return signal === undefined ? deadline : AbortSignal.any([signal, deadline]);
}
