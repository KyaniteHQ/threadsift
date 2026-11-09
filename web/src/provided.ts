export function provided<Value>(value: Readonly<Value> | null, owner: string): Readonly<Value> {
  if (value === null) throw new Error(`${owner} needs its context provider`);

  return value;
}
