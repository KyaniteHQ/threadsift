export const TEXT = {
  saving: "Saving…",
  saved: "Page saved.",
  openItem: "Open in Threadsift",
  notConfigured: "Add your Threadsift address and agent token in the settings to save pages.",
  openSettings: "Open settings",
  accessMissing: "The Extension has no access to your address. Allow access in the settings.",
  pageBlocked: "Your browser doesn’t let extensions read this page, so it can’t be saved.",
  tokenRefused: "Your agent token is wrong or was revoked. Check it in the settings.",
  scopeRefused:
    "Your agent token is missing a scope the Extension needs. Use a token with the Read and Add scopes in the settings.",
  tooLarge: "The text on this page is too long to save.",
  privateLink: "This link leads to a private network or your computer, so it wasn’t saved.",
  unsupportedLink:
    "The Extension can’t save X, GitHub or Reddit pages other than a Reddit post or comment.",
  threadKept:
    "Couldn’t read this Reddit thread from the page. The copy in Threadsift stays as it was.",
  updating: "The library is finishing an update, so this page wasn’t saved. Try again in a minute.",
  unreachable: "Couldn’t reach your Threadsift address. Check the address and your connection.",
  failed: "Couldn’t save this page.",
  tryAgain: "Try again",
  settingsTitle: "Extension settings",
  addressLabel: "Threadsift address",
  addressHint:
    "A remote address must start with https://; http:// works only for localhost and 127.0.0.1.",
  addressInvalid: "Enter an https:// address, or http:// for localhost or 127.0.0.1.",
  tokenLabel: "Agent token",
  tokenKept:
    "An agent token is saved. Leave the field empty to keep it, or enter a new token to replace it.",
  tokenHint:
    "Create an agent token in Threadsift settings under Agent tokens with the Read and Add scopes.",
  tokenMissing: "Enter an agent token.",
  saveSettings: "Save settings",
  settingsSaved: "Settings saved.",
  settingsNotSaved: "Couldn't save the settings, so nothing changed. Try saving again.",
  oldAccessKept:
    "Settings saved. Your browser couldn't remove access to the old address, so it keeps access until you remove it in the browser's extension settings.",
  settingsUnreadable: "Couldn't load the settings. Reload the page.",
  accessDenied:
    "Access to the address was denied, so the settings weren’t saved. The Extension can’t save pages without it.",
  fillTitle: "Fill saved Reddit Items",
  fillHint:
    "Opening a Reddit thread in your tab lets the Extension fill a matching saved Item that has no thread yet. Your browser will ask for access to reddit.com when you turn this on.",
  fillTurnOn: "Turn on",
  fillTurnOff: "Turn off",
  fillIsOn: "Filling saved Reddit Items is on.",
  fillIsOff: "Filling saved Reddit Items is off.",
  fillDenied: "Access to reddit.com was denied, so nothing changed.",
  fillFailed: "Couldn't change access to reddit.com. Try again.",
  manifestDescription: "Save the page in your current tab to your Threadsift reading library.",
  actionTitle: "Save to Threadsift",
} as const;
