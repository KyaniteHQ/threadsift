export const OBSIDIAN_TEXT = {
  backToSettings: "Back to Settings",
  title: "Obsidian",
  intro:
    "The vault mirror writes item notes and files, topic pages, the index and the log as Markdown to the GitHub repository for your Obsidian vault. Changes flow one way, from Threadsift to the vault. Verify checks the branch without saving settings or writing files. Save queues the current library.",
  containerIntro:
    "The vault mirror writes item notes and files, topic pages, the index and the log as Markdown to your Obsidian vault. Changes flow one way, from Threadsift to the vault.",
  modeLabel: "Destination",
  githubMode: "GitHub repository",
  folderMode: "Folder",
  folderLabel: "Folder path",
  folderHelp:
    "Enter the absolute path to your mounted Obsidian vault inside the container, such as /vault. The vault mirror writes inside a Threadsift folder there. The mounted file system must support hard links.",
  conflict:
    "Skipped the note at {path} because a file Threadsift didn’t write is already there. Move that file so Threadsift can write the note.",
  folderPath:
    "A path the vault mirror expects is a symbolic link or isn’t a folder. Check the paths in your vault and try again.",
  folderFull: "The mounted vault is out of disk space or quota. Free up space and try again.",
  folderLinks:
    "The mounted file system doesn’t support hard links. Choose a folder on a file system that supports them.",
  folderFailed: "A file operation in the vault folder failed. Try again.",
  folderConfigured: "The vault folder is saved on this instance.",
  folderVerified: "The mounted folder is writable.",
  folderMissing:
    "That folder doesn’t exist in the container. Check the mounted path and try again.",
  folderPermission:
    "This instance can’t write to the vault folder or its Threadsift folder. Check the mount permissions and try again.",
  folderInvalid: "Enter an absolute path in the container with no . or .. parts.",
  folderUnavailable: "A folder destination is only available when Threadsift runs in a container.",
  vaultBusy:
    "The vault mirror is finishing a write, so settings can’t be saved or removed yet. Wait a moment and try again.",
  repositoryLabel: "Repository",
  repositoryHelp: "Enter the GitHub repository for your vault as owner/repo.",
  branchLabel: "Branch",
  branchHelp: "Enter an existing branch in that repository, such as main.",
  tokenLabel: "Token",
  tokenHelp:
    "Use a fine-grained GitHub token limited to this repository, with Contents read and write permission. Threadsift keeps it sealed on this instance and never shows it again.",
  save: "Save",
  saving: "Saving…",
  verify: "Verify",
  verifying: "Verifying…",
  remove: "Remove",
  removing: "Removing…",
  saved: "Vault mirror settings are saved. The whole library is queued.",
  removed: "Vault mirror settings were removed.",
  verified:
    "The token reached the repository and branch. Verify doesn’t test write permission or write files.",
  missing: "No vault mirror is set up on this instance.",
  configured: "A token is saved on this instance.",
  unreadable:
    "This instance can no longer open the saved token. Save a new token or remove the vault mirror.",
  loadFailed: "Couldn’t load the Obsidian settings. Reload the page.",
  failed: "Couldn’t reach Threadsift. Check the connection and try again.",
  invalid: "The repository, branch or token isn’t valid. Check them and try again.",
  wrongToken: "GitHub rejected the token. Check it and try again.",
  notFound:
    "GitHub couldn’t find that repository or branch with this token. Check the repository name, branch name and which repositories the token can access.",
  permission:
    "GitHub refused access to the repository or branch. Check that the token has Contents read and write permission and that branch protection allows pushes.",
  rateLimited: "GitHub is limiting requests. Wait a few minutes and try again.",
  unreachable: "Couldn’t reach GitHub. Check the connection and try again.",
  githubError: "GitHub returned an error. Try again.",
  timeout: "GitHub timed out. Try again.",
} as const;
