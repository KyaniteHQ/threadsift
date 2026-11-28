# Changelog

## Unreleased

### Before you update

- Let a running Restore end, or cancel it, before you update. A migration adds the table `database_identity` and another adds the Topic of each Topic overview job (`jobs.topic_id`), so a Restore that still runs when the update applies them ends `failed` with `other-release`.
- Take a new Export after the update. Restore accepts only an Export of the migration the Instance runs, so it refuses an Export taken before this update.
- Save a Note you are writing before you update. The first time you open the updated web app signed in, it deletes the Note drafts and Restore upload fingerprints that the older web app stored. A Restore upload that stopped half sent then accepts the next file you choose, so choose the same zip again.
- On Cloudflare, an overview job that the previous Worker opens while the deploy runs has no Topic. It runs when the previous Worker claims it, and it ends without a run when the new Worker claims it. Its Topic runs again at its next Digest, at Try again, or when the owner accepts an overview-gap Proposal ([CI, releases and rollback](docs/architecture/ci-releases-and-rollback.md#the-topic-of-an-overview-job)).
- Let a running Export finish before you update. An Export that the update finds stopped inside an Item ends `failed` with "The export stopped because this instance was updated while it ran.", and you start a new one.

### Added

- Each release attaches the Extension's Chrome zip, Firefox zip and source archive, and each stable release is submitted to the Chrome Web Store and Firefox Add-ons. A daily check reports when a store rejects, takes down or warns the Extension, or still shows an older version 21 days after a release.

### Fixed

- A Topic overview run works for the Topic it was opened for, also when its owner Item moves to another Topic first, and a run that gives up marks that Topic.
- A Topic merge moves the queued overview jobs of the merged-away Topic to the Topic it went into, and closes a running one, so the merge opens a new run for that Topic.
- An Export of an Item that is refreshed between two slices of its own files holds every image and post text file of the newer version, and one note.
- An unsaved Note draft, the check that a resumed Restore upload uses the same file, and a tab's reading places no longer carry over to another database at the same address, where Item and Restore ids start at 1 again. Each database has its own random name, and a Restore gives the database a new one when it finishes. A Restore therefore also drops the unsaved Note drafts that browser kept for the library before it.
