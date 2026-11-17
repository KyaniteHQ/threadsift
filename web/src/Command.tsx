export function Command({ text }: Readonly<{ text: string }>) {
  return (
    <pre className="cmd">
      <code>{text}</code>
    </pre>
  );
}
