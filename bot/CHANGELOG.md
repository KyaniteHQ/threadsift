# Changelog

## Unreleased

## bot-v2

- The bot has no file tool, so text that comes from outside is written to a file through `mark` and `write`, and the skill shows the one heredoc form for it.
- The script deletes the files it is given, deletes old files in `tmp` and old task folders, answers `already-open` for a task another run has, and keeps the bookmark cursor through `bookmarks-get` and `bookmarks-set`. `search` and `topics` write `search-<hex>.json` and `topics-<hex>.json`.
- `append <name>` adds to a file `write` made, so a text longer than 3,000 characters is typed in several shell calls. `write` and `append` drop the one final newline the heredoc adds. The bot reads at most the first 100 replies of an X post.

## bot-v1

- First version of the Threadsift bot: webhook tasks (an X link and the AI tasks), save, search, topics and X bookmark sync through one script.
