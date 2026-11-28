export const REDDIT_TEXT = {
  sectionTitle: "Reddit archive fill",
  intro:
    "For Reddit links added without the extension, Threadsift can fill the post and its comments from the public Arctic Shift archive. It sends the archive only the post’s id. Saving with the extension replaces the archive copy.",
  fieldLabel: "Fill new Reddit links",
  optionOn: "On",
  optionOff: "Off",
  stateOn:
    "For a Reddit link added without the extension, Threadsift asks the public Arctic Shift archive for the post and comments unless a connected Reddit account reads it. If that fails, the link stays a link-only item.",
  stateOff:
    "A Reddit link added without the extension stays a link-only item unless a connected Reddit account reads it. Use the extension to save the thread.",
  loadFailed: "Couldn’t load the Reddit archive fill setting. Reload the page.",
  failed: "Couldn’t save the setting. Try again.",
  restoring:
    "Couldn’t save the setting because a restore is running. Pick On or Off again once it finishes.",
  saving: "Saving…",
} as const;
