import { type ReactNode, ViewTransition } from "react";

export function SharedItem({ id, children }: Readonly<{ id: number; children: ReactNode }>) {
  return (
    <ViewTransition name={`lib-item-${String(id)}`} share="lib-item" default="none">
      {children}
    </ViewTransition>
  );
}
