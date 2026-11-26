import type { ReactNode } from "react";

import { Wordmark } from "./Wordmark.tsx";

export function AuthShell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="auth">
      <div className="auth-col">
        <header>
          <p className="auth-mark wordmark">
            <Wordmark />
          </p>
        </header>
        <main className="auth-block">{children}</main>
      </div>
    </div>
  );
}
