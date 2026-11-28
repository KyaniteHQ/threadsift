# Changelog

## Unreleased

### Before you update

- Let a running Export finish before you update. An Export that the update finds stopped inside an Item ends `failed` with "The export stopped because this instance was updated while it ran.", and you start a new one.

### Fixed

- An Export of an Item that is refreshed between two slices of its own files holds every image and post text file of the newer version, and one note.
