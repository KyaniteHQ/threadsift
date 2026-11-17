import { type ChangeEvent, useCallback, useRef } from "react";

export function useFilePicker(choose: (file: Readonly<File>) => void, enabled: boolean) {
  const picker = useRef<HTMLInputElement>(null);

  const open = useCallback(() => {
    if (enabled) picker.current?.click();
  }, [enabled]);

  const read = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const [file] = event.target.files ?? [];

      event.target.value = "";

      if (file !== undefined) choose(file);
    },
    [choose],
  );

  return { picker, open, read };
}
