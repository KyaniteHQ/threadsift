export const OBSIDIAN_TEXT = {
  backToSettings: "Back to settings",
  title: "Obsidian",
  intro:
    "Write a one-way Vault mirror of Markdown notes to a GitHub repository for your Obsidian vault. Verify checks the repository and branch without saving or writing files. Save seals the token and queues existing Items and later Pastes. Only Paste notes are mirrored right now; other Item changes and wiki notes follow later.",
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
  saved: "Vault mirror saved. Existing Items and later Pastes are queued.",
  removed: "Vault mirror removed.",
  verified: "Repository and branch reached. Verify does not test write permission or write files.",
  missing: "No Vault mirror is set up on this Instance.",
  configured: "Token saved on this Instance.",
  unreadable:
    "This Instance can no longer open the saved token. Save a new token or remove the Vault mirror.",
  loadFailed: "Couldn't load the Obsidian settings. Reload the page.",
  failed: "Couldn't reach Threadsift. Check your connection and try again.",
  invalid: "Check the repository, branch and token, then try again.",
  secretMissing:
    "This Instance has no THREADSIFT_SECRET_KEY set, so it cannot seal the token. Set THREADSIFT_SECRET_KEY on the Instance and reload this page.",
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
