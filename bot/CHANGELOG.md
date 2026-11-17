# Changelog

## Unreleased

## bot-v9

- Remove the `updating` result because the Instance no longer rewrites stored keys. These calls use the existing failure result while a Restore holds the library.

## bot-v8

- A thread read keeps the posts an X post quotes and the photos of the post. The skill asks the bot for the chain of quoted posts, 5 at most, in `post.quoted`, and for the photo addresses of the post, of each quoted post and of each reply by the post's author in `images`, and the bot leaves the media link out of the text of a post it sends with photos and the link of the quoted post out of the text of a post that quotes one, so the Instance can check the chain. The skill now names the fields it needs from the X tools, including `media.fields` `url`. Before, an answer held no quoted post and no photo. An X link saved in chat sends quoted posts and no photos, because a Paste carries no photos. A thread read now takes one more post read for each quoted post, 5 at most. Update the Threadsift Instance first: an Instance from before this release refuses an answer that holds `images`.

## bot-v7

- The script deletes the folder of a task that stays unanswered for one day, which takes its credential with it, the folder of a task 7 days after it is done, and any file in `tmp` older than a day, on every command except `mark`. Before, the folder rules ran only on a `task-open` that was not a ping and not for a task that was already done or was opened less than an hour ago, and the `tmp` rule only on `write` or `append`, so a bot that kept saving links and searching but received no new task kept the credential of an unanswered task past one day. A task folder that kept only its text after bot-v6 deleted the credential is deleted by the same rule. A prune that fails no longer stops the command.

## bot-v6

- A chat save links the Item even when the Instance URL is a stored secret. `save` prints `ok <id> <path>` and `duplicate <id> <path>`, where `<path>` is `/items/<id>`, instead of an address with the Instance URL, which the chat hides because that URL is a stored secret. The skill joins the path to the Instance URL it keeps as a memory, and only after the new `same-address <file>` command printed `ok`: it compares that memory with the address in the `THREADSIFT_URL` card and prints `ok` or `differs`, never either address. Setup now asks you to type the address in chat and saves it as the memory, because a card's value is for the script only. A bot without the memory, or with a note in its place, asks for the address on the first link it saves and in later "update threadsift" runs, and answers with the id and no link until you answer. A bot that is updated from bot-v5 runs the old updater, which replaces the script before it rewrites the skill. When the skill rewrite fails in between, the old skill shows a path as a link that opens nothing; say "update threadsift" again to finish the update.
- Five lines of the bot files now say what the script does. The script deletes a file left in `tmp` after one day only when a later `write` or `append` stores its text, and it deletes an unanswered task's credential after one day, and a finished task's folder after 7 days, only when a later `task-open` is not a ping and not for a task that is already done or was opened less than an hour ago. `topics` and `forget` take the hex of a `mark` word. A `search` file lists the library's Tags in `counts.tags`. After `unreachable` or `failed` on a send with `cursor`, the Instance may have saved the cursor. A thread read takes one post read and up to 5 search pages, not two reads.

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
