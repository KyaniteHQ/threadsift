import type { ReactNode } from "react";

export function AuthShell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="auth">
      <div className="auth-col">
        <header>
          <p className="auth-mark">Threadsift</p>
        </header>
        <main className="auth-block">{children}</main>
      </div>
    </div>
  );
}
