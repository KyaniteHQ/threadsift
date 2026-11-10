export type Failure = Readonly<
  { reason: string; recovery: string } & (
    | { kind: "check" }
    | { kind: "http"; status: number }
    | { kind: "command"; exitCode: number | null; providerCode: number | null }
  )
>;

export class CommandFailure extends Error {
  readonly failure: Failure;

  constructor(failure: Failure) {
    super(failure.reason);
    this.failure = failure;
  }
}
