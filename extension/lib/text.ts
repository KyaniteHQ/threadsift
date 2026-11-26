export const TEXT = {
  saving: "Saving…",
  saved: "Saved",
  savedIncomplete: "The thread was saved. Some replies couldn’t be read.",
  savedPage: "Couldn’t read the comments. The page text was saved instead.",
  openItem: "Open in Threadsift",
  notConfigured: "Add your Threadsift address and agent token to save pages.",
  openSettings: "Open settings",
  accessMissing:
    "The extension doesn’t have permission to reach your Threadsift address. Select Save settings in Threadsift extension settings so your browser asks for access.",
  pageBlocked:
    "Couldn’t read this page. Either your browser blocks extensions on it, or the page has no readable text.",
  tokenRefused: "Threadsift rejected the saved agent token. It is wrong or was revoked.",
  scopeRefused:
    "The saved agent token needs the Read and Add scopes. Create one under Agent tokens in Threadsift’s Settings, then enter it in Threadsift extension settings.",
  tooLarge: "The text on this page is too long to save.",
  privateLink: "Pages at an address not reachable from the public internet can’t be saved.",
  unsupportedLink:
    "The extension can’t save X posts, GitHub pages, short links or Reddit share links. On Reddit, it saves only posts and comments.",
  budgetSpent:
    "The saved agent token reached its daily budget, so this page wasn’t saved. Saving works again after 00:00 UTC. You can also select Change budget under Agent tokens in Threadsift’s Settings.",
  threadKept: "Couldn’t read this Reddit thread. The saved item in Threadsift stays as it was.",
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
    "Create an agent token in Threadsift settings under Agent tokens with the Read and Add scopes. Connecting a Reddit account also needs the Reddit scope.",
  tokenMissing: "Enter an agent token.",
  saveSettings: "Save settings",
  settingsSaved: "Settings saved.",
  settingsNotSaved: "Couldn’t save the settings, so nothing changed. Try saving again.",
  oldAccessKept:
    "Settings saved. Your browser couldn’t remove access to the old address, so it keeps access until you remove it in the browser’s extension settings.",
  accessKeptNotSaved:
    "Couldn’t save the settings. Your browser couldn’t remove access to the address, so it keeps access until you remove it in the browser’s extension settings.",
  settingsUnreadable: "Couldn’t load the settings. Reload the page.",
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
  fillFailed: "Couldn’t change access to reddit.com. Try again.",
  fillUnreadable: "Couldn’t check whether filling is on. Reload the page.",
  redditTitle: "Reddit account",
  redditHint:
    "Connect the Reddit account this browser is signed in to so Threadsift can read Reddit links, and use a separate account because Reddit’s User Agreement forbids scraping without written consent. Your browser will ask for access to cookies and reddit.com when you connect.",
  redditConnect: "Connect Reddit",
  redditReconnect: "Reconnect",
  redditDisconnect: "Disconnect",
  redditWorking: "Connecting or disconnecting your Reddit account…",
  redditNone: "No Reddit account is connected to Threadsift.",
  redditConnected: "Your Reddit account is connected to Threadsift.",
  redditExpired:
    "Reddit stopped accepting the saved session, so reconnect while signed in to Reddit in this browser.",
  redditUnreadable: "Threadsift can no longer open the saved session, so reconnect.",
  redditMissing:
    "This Threadsift Instance has no secret key to seal the session, so it can’t connect until the owner sets one.",
  redditNoAccess:
    "Your browser didn’t give the Extension access to cookies and reddit.com, so nothing was sent.",
  redditSignedOut:
    "This browser isn’t signed in to Reddit in a normal window; sign in to Reddit, then press the button again.",
  redditScopeRefused:
    "Your agent token lacks the Reddit scope; make one with Read, Add and Reddit under Agent tokens and enter it above.",
  redditTokenRefused: "Your agent token is wrong or was revoked; check it above.",
  redditUnreachable:
    "Couldn’t reach your Threadsift address; check the address and your connection.",
  redditFailed: "Couldn’t connect, reconnect or disconnect the Reddit account, so nothing changed.",
  redditAccessKept:
    "The Reddit account was removed from Threadsift, but your browser kept the Extension’s access to cookies. Press Disconnect again to give it back.",
  popupExpired:
    "Reddit no longer accepts the saved session. You need to be signed in to Reddit in this browser to reconnect.",
  manifestDescription:
    "Save the current page, or a Reddit thread with its comments, to your Threadsift reading library.",
  actionTitle: "Save to Threadsift",
  badgeSaved: "✓",
  badgeNotSaved: "!",
} as const;
