export const TEXT = {
  saving: "Saving…",
  saved: "Page saved.",
  savedIncomplete: "The thread was saved, but some replies are missing.",
  savedPage: "Couldn’t read the thread’s comments, so the page was saved instead.",
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
  budgetSpent:
    "Your agent token’s daily budget of Items is used up, so this page wasn’t saved. Saving works again after 00:00 UTC, or the budget can be raised in the Threadsift settings.",
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
    "Reddit stopped accepting the connected Reddit account; the button below reconnects it.",
  manifestDescription: "Save the page in your current tab to your Threadsift reading library.",
  actionTitle: "Save to Threadsift",
} as const;
