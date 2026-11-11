import { useCallback, useEffect, useRef, useState } from "react";

export function useImportInput() {
  const [text, setText] = useState("");
  const [fileFailed, setFileFailed] = useState(false);
  const generation = useRef(0);

  useEffect(
    () => () => {
      generation.current += 1;
    },
    [],
  );

  const type = useCallback((next: string) => {
    generation.current += 1;
    setFileFailed(false);
    setText(next);
  }, []);

  const choose = useCallback(async (file: Readonly<Pick<File, "text">>): Promise<void> => {
    generation.current += 1;

    const mine = generation.current;

    setFileFailed(false);

    try {
      const read = await file.text();

      if (generation.current === mine) setText(read);
    } catch {
      if (generation.current === mine) setFileFailed(true);
    }
  }, []);

  const seal = useCallback(() => {
    generation.current += 1;
  }, []);

  return { text, fileFailed, type, choose, seal };
}

export type ImportInput = Readonly<ReturnType<typeof useImportInput>>;
