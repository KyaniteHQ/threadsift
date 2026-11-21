export const OBSIDIAN_TEXT = {
  backToSettings: "Back to settings",
  title: "Obsidian",
  intro:
    "The Vault mirror writes Item notes and files, Topic pages, the Index and the Log as Markdown in the chosen GitHub repository for your Obsidian vault. Edits flow from Threadsift to the vault. Verify checks the branch without saving or writing. Save queues the current library.",
  containerIntro:
    "The Vault mirror writes Item notes and files, Topic pages, the Index and the Log as Markdown in your Obsidian vault. Edits flow from Threadsift to the vault.",
  modeLabel: "Destination",
  githubMode: "GitHub repository",
  folderMode: "Folder",
  folderLabel: "Folder path",
  folderHelp:
    "Enter the absolute path of the mounted Obsidian vault inside the container, such as /vault. The mounted filesystem must support hard links, and the Vault mirror writes under Threadsift.",
  conflict:
    "A file at {path} that Threadsift did not write blocks a note. Move the file so Threadsift can write the note.",
  folderPath:
    "An expected vault directory is a symlink or is not a directory. Check those paths and try again.",
  folderFull: "The mounted vault has no disk space or quota left.",
  folderLinks:
    "The mounted filesystem does not support hard links. Choose a folder on a filesystem that supports them.",
  folderFailed: "A file operation in the vault folder failed. Try again.",
  folderConfigured: "Vault folder saved on this Instance.",
  folderVerified: "Mounted folder is writable.",
  folderMissing:
    "That folder does not exist in the container. Check the mounted path and try again.",
  folderPermission:
    "This Instance cannot write to the vault or its Threadsift folder. Check the mount permissions and try again.",
  folderInvalid: "Enter an absolute path in the container with no . or .. segments.",
  folderUnavailable: "Folder mode is only available on the container.",
  vaultBusy:
    "The Vault mirror is finishing a write, so the setting cannot be saved or removed yet. Wait a moment and try again.",
  repositoryLabel: "Repository",
  repositoryHelp: "The GitHub repository for your vault, written as owner/repo.",
  branchLabel: "Branch",
  branchHelp: "An existing branch in that repository, such as main.",
  tokenLabel: "Token",
  tokenHelp:
    "Use a fine-grained GitHub token limited to this repository with Contents read and write permission. Threadsift keeps it sealed on this Instance and never shows it again.",
  save: "Save",
  saving: "Saving…",
  verify: "Verify",
  verifying: "Verifying…",
  remove: "Remove",
  removing: "Removing…",
  saved: "Vault mirror settings saved. The library is queued.",
  removed: "Vault mirror removed.",
  verified: "Repository and branch reached. Verify does not test write permission or write files.",
  missing: "No Vault mirror is set up on this Instance.",
  configured: "Token saved on this Instance.",
  unreadable:
    "This Instance can no longer open the saved token. Save a new token or remove the Vault mirror.",
  loadFailed: "Couldn't load the Obsidian settings. Reload the page.",
  failed: "Couldn't reach Threadsift. Check your connection and try again.",
  invalid: "Check the repository, branch and token, then try again.",
  wrongToken: "GitHub rejected the token. Check the token and try again.",
  notFound:
    "GitHub could not find that repository or branch with this token. Check the repository name, the branch name and the token's repository access.",
  permission:
    "GitHub refused access to the repository or branch. Check that the token has Contents read and write permission and that branch protection allows pushes.",
  rateLimited: "GitHub is limiting requests right now. Wait a few minutes and try again.",
  unreachable: "Couldn't reach GitHub. Check the connection and try again.",
  githubError: "GitHub returned an error. Try again.",
  timeout: "GitHub timed out. Try again.",
} as const;
