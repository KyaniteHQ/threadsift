export function logFailure(
  event: string,
  fields: Readonly<Record<string, string | number>>,
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- a catch variable is unparsed by construction, and this function reduces it to a class name.
  error: unknown,
): void {
  const errorClass = error instanceof Error ? error.constructor.name : "NotAnError";

  console.error(JSON.stringify({ event, ...fields, error: errorClass }));
}
