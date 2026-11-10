export const REDDIT_TEXT = {
  sectionTitle: "Reddit archive fill",
  intro:
    "For Reddit links pasted without the Extension, Threadsift can fill the post and its comments from the public Arctic Shift archive. It sends only the post’s id, and saving with the Extension replaces the archive copy.",
  fieldLabel: "Fill pasted Reddit links",
  optionOn: "On",
  optionOff: "Off",
  stateOn:
    "Threadsift fills newly pasted Reddit links with post text and comments from the Arctic Shift archive.",
  stateOff: "A pasted Reddit link stays a Link-only Item until the Extension saves the thread.",
  loadFailed: "Couldn’t load the Reddit archive fill setting. Reload the page.",
  failed: "Couldn’t save the setting. Try again.",
  saving: "Saving setting…",
} as const;
