import { createContext, useContext, useEffect } from "react";

export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title;
  }, [title]);
}

type SetPageName = (name: string) => void;

export const PageNameContext = createContext<SetPageName | null>(null);

export function usePageName(name: string): void {
  const setPageName = useContext(PageNameContext);

  if (setPageName === null) {
    throw new Error("usePageName requires a PageNameContext provider");
  }

  useEffect(() => {
    setPageName(name);

    return () => {
      setPageName("");
    };
  }, [name, setPageName]);
}
