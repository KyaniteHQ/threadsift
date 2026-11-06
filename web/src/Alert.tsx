export function Alert({ text }: Readonly<{ text: string | null }>) {
  return text === null ? null : (
    <p role="alert" className="fld-err">
      {text}
    </p>
  );
}
