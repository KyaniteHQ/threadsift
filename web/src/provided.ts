export function provided<Value>(value: Value | null, owner: string): Value {
  if (value === null) throw new Error(`${owner} needs its context provider`);

  return value;
}
