export function DescriptionRow({ name, value }: Readonly<{ name: string; value: string }>) {
  return (
    <div>
      <dt className="label">{name}</dt>
      <dd>{value}</dd>
    </div>
  );
}
