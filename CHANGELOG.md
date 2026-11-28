# Changelog

## Unreleased

### Before you update

- Let a running Restore end, or cancel it, before you update. A migration adds the Topic of each Topic overview job (`jobs.topic_id`), so a Restore that still runs when the update applies it ends `failed` with `other-release`.
- Take a new Export after the update. Restore accepts only an Export of the migration the Instance runs, so it refuses an Export taken before this update.
- On Cloudflare, an overview job that the previous Worker opens while the deploy runs has no Topic. It runs when the previous Worker claims it, and it ends without a run when the new Worker claims it. Its Topic runs again at its next Digest, at Try again, or when the owner accepts an overview-gap Proposal ([CI, releases and rollback](docs/architecture/ci-releases-and-rollback.md#the-topic-of-an-overview-job)).

### Fixed

- A Topic overview run works for the Topic it was opened for, also when its owner Item moves to another Topic first, and a run that gives up marks that Topic.
- A Topic merge moves the queued overview jobs of the merged-away Topic to the Topic it went into, and closes a running one, so the merge opens a new run for that Topic.
