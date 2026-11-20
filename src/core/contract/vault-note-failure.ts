export class VaultNoteFailure extends Error {
  readonly reason: "file-missing" | "file-changed" | "file-too-large" | "log-unreadable";

  constructor(reason: VaultNoteFailure["reason"]) {
    super(reason);
    this.reason = reason;
  }
}
