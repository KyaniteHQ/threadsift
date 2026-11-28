# Changelog

## Unreleased

### Before you update

- A migration adds the Topic of each Topic overview job (`jobs.topic_id`). An overview job that the previous Worker opens while the deploy runs ends without a run, and its Topic runs again at its next Digest, Try again or weekly check ([CI, releases and rollback](docs/architecture/ci-releases-and-rollback.md#the-topic-of-an-overview-job)).

### Fixes

- A Topic overview run works for the Topic it was opened for, also when its owner Item moves to another Topic first, and a run that gives up marks that Topic.
