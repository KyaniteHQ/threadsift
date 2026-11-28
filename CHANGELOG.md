# Changelog

## Unreleased

### Before you update

- Let a running Restore end, or cancel it, before you update. A migration adds the table `database_identity`, so a Restore that still runs when the update applies it ends `failed` with `other-release`.
- Take a new Export after the update. Restore accepts only an Export of the migration the Instance runs, so it refuses an Export taken before this update.
- Save a Note you are writing before you update. The first time you open the updated web app signed in, it deletes the Note drafts and Restore upload fingerprints that the older web app stored. A Restore upload that stopped half sent then accepts the next file you choose, so choose the same zip again.

### Added

- Each release attaches the Extension's Chrome zip, Firefox zip and source archive, and each stable release is submitted to the Chrome Web Store and Firefox Add-ons. A daily check reports when a store rejects, takes down or warns the Extension, or still shows an older version 21 days after a release.

### Fixed

- An unsaved Note draft, the check that a resumed Restore upload uses the same file, and a tab's reading places no longer carry over to another database at the same address, where Item and Restore ids start at 1 again. Each database has its own random name, and a Restore gives the database a new one when it finishes. A Restore therefore also drops the unsaved Note drafts that browser kept for the library before it.
