import type { ReactNode } from "react";

export function SettingsSection({
  id,
  title,
  intro,
  children,
}: Readonly<{ id: string; title: string; intro: string; children: ReactNode }>) {
  return (
    <section id={id} className="sec" aria-labelledby={`${id}-title`}>
      <div className="sec-head">
        <h2 id={`${id}-title`} className="rd-h" tabIndex={-1}>
          {title}
        </h2>
        <p>{intro}</p>
      </div>
      <div className="sec-body">{children}</div>
    </section>
  );
}
