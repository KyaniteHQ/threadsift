# Changelog

## Unreleased

### Before you update

- A migration gives each database its own random identity (`database_identity`). The web app now keeps an unsaved Note draft and a Restore upload's file fingerprint per database, so a draft typed before the update is dropped the first time the new web app loads. Save a Note you are writing before you update.

### Fixes

- An unsaved Note draft, and the check that a resumed Restore upload uses the same file, no longer carry over to a new database at the same address, where Item and Restore ids start at 1 again.
