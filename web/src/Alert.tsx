export function Alert({ text }: Readonly<{ text: string | null }>) {
  return (
    <p role="alert" className="fld-err">
      {text}
    </p>
  );
}
