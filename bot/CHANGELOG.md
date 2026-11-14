# Changelog

## Unreleased

- A bookmark sync that stops at 20 pages stores the top bookmark as its cursor, so the next sync starts from the top instead of sending the same 2,000 bookmarks again.

## bot-v3

- The skill now holds the bot's rules (what it never does, its voice, and what its memory holds), and an installed bot keeps its own profile.
- The bookmark sync sends only the post ids of the bookmarks and stops when it reaches the bookmark where the previous run ended, while the Threadsift Instance keeps the position of the sync and asks the bot for each thread itself, a separate request imports all bookmarks once, and a new install runs the sync every 3 hours while an installed bot keeps the schedule of its routine.
- The bot reads the full text of a long X post instead of the first 280 characters, lists the root post of a thread once, and deletes the search and topic files it made.
- Bookmark folders are not imported because the bot reads only the bookmark list.

## bot-v2

- The bot has no file tool, so text that comes from outside is written to a file through `mark` and `write`, and the skill shows the one heredoc form for it.
- The script deletes the files it is given, deletes old files in `tmp` and old task folders, answers `already-open` for a task another run has, and keeps the bookmark cursor through `bookmarks-get` and `bookmarks-set`. `search` and `topics` write `search-<hex>.json` and `topics-<hex>.json`.
- `append <name>` adds to a file `write` made, so a text longer than 3,000 characters is typed in several shell calls. `write` and `append` drop the one final newline the heredoc adds. The bot reads at most the first 100 replies of an X post.

## bot-v1

- First version of the Threadsift bot: webhook tasks (an X link and the AI tasks), save, search, topics and X bookmark sync through one script.
