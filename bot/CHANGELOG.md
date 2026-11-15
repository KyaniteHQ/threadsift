# Changelog

## Unreleased

## bot-v6

- A chat save links the Item even when the Instance URL is a stored secret. `save` prints `ok <id> <path>` and `duplicate <id> <path>`, where `<path>` is `/items/<id>`, instead of an address with the Instance URL, which the chat hides because that URL is a stored secret. The skill tells the bot to join the path to the Instance URL it keeps as a memory, and to answer with the id and no link when that memory is missing.
- Five lines of the bot files now say what the script does. The script deletes a file left in `tmp` after one day only when a later `write` or `append` stores its text, and it deletes an unanswered task's credential after one day, and a finished task's folder after 7 days, only when a later `task-open` starts another task. `topics` and `forget` take the hex of a `mark` word. A `search` file lists the library's Tags in `counts.tags`. After `unreachable` or `failed` on a send with `cursor`, the Instance may have saved the cursor. A thread read takes one post read and up to 4 search pages, not two reads.

## bot-v5

- A chat save answers with a link to the Item in your library. `save` prints `ok <id> <address>` for a new link and `duplicate <id> <address>` for a link the library already holds, and the skill tells the bot to answer with the link, instead of `ok` and `duplicate` alone, which gave the bot no Item to link.

## bot-v4

- `write` stores an empty file and answers `ok`, and `append` leaves the file as it was and answers `ok`, when the shell starts the script with its standard input closed, the same as with an empty standard input, instead of `bad-input` with "no text on standard input". No other command reads standard input, so no other command changes.
- A bookmark sync that stops at 20 pages stores the top bookmark as its cursor, so the next sync starts from the top instead of sending the same 2,000 bookmarks again.
- A bookmark sync that finds the stored bookmark first on a page sends nothing for that page and goes on, instead of running `bookmarks-send` with no ids, which the script answers with `bad-input` and which ended the run.

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
