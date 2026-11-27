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
    "Couldn’t read this page. It may not be a web page, or the browser may block extensions on it.",
  tokenRefused: "Threadsift rejected the saved agent token. It is wrong or was revoked.",
  scopeRefused:
    "The saved agent token needs the Read and Add scopes. Create one under Agent tokens in Threadsift’s Settings, then enter it in Threadsift extension settings.",
  tooLarge: "The text on this page is too long to save.",
  privateLink: "This page can’t be saved. Its address isn’t reachable from the public internet.",
  unsupportedLink:
    "The extension can’t save this page. It doesn’t save X posts, GitHub pages, short links or Reddit share links. On Reddit, it saves only posts and comments.",
  budgetSpent:
    "The saved agent token reached its daily budget, so this page wasn’t saved. Saving works again after 00:00 UTC. You can also select Change budget under Agent tokens in Threadsift’s Settings.",
  threadKept: "Couldn’t read this Reddit thread. The saved item in Threadsift stays as it was.",
  unreachable: "Couldn’t reach your Threadsift address. Check the address and your connection.",
  failed: "Couldn’t save this page.",
  tryAgain: "Try again",
  settingsTitle: "Threadsift extension settings",
  addressLabel: "Threadsift address",
  addressHint: "Use an https:// address, or http:// only for localhost or 127.0.0.1.",
  addressInvalid: "Enter an https:// address, or http:// for localhost or 127.0.0.1.",
  tokenLabel: "Agent token",
  tokenKept:
    "A token is saved. Leave this field empty to keep it, or enter a new one to replace it.",
  tokenHint:
    "Create one in Threadsift Settings under Agent tokens with the Read and Add scopes. Connecting a Reddit account also needs the Reddit scope.",
  tokenMissing: "Enter an agent token.",
  saveSettings: "Save settings",
  settingsSaved: "Settings saved",
  settingsNotSaved: "Couldn’t save the settings, so nothing changed. Try again.",
  oldAccessKept:
    "Settings saved. The browser couldn’t remove the extension’s access to the previous address. You can remove it in the browser’s extension settings.",
  accessKeptNotSaved:
    "Couldn’t save the settings. The browser also couldn’t remove the extension’s access to that address. You can remove it in the browser’s extension settings.",
  settingsUnreadable: "Couldn’t load the settings. Reload the page.",
  accessDenied:
    "Access to the address was denied, so the settings weren’t saved. The extension can’t save pages without it.",
  fillTitle: "Fill saved Reddit items",
  fillHint:
    "When you open a Reddit post or comment in a tab, the extension saves the thread into any matching item that doesn’t have one yet. Nothing runs in the background. The browser will ask for access to reddit.com when you turn this on.",
  fillTurnOn: "Turn on",
  fillTurnOff: "Turn off",
  fillIsOn: "Filling is on.",
  fillIsOff: "Filling is off.",
  fillDenied: "Access to reddit.com was denied, so nothing changed.",
  fillFailed: "Couldn’t change access to reddit.com. Try again.",
  fillUnreadable: "Couldn’t check whether filling is on. Reload the page.",
  redditTitle: "Reddit account",
  redditHint:
    "Connect the Reddit account this browser is signed in to so Threadsift can read Reddit links saved without the extension. Use a separate Reddit account, because Reddit’s User Agreement forbids scraping without written consent and the requests use your own session. The browser will ask for access to cookies and reddit.com when you connect.",
  redditConnect: "Connect Reddit",
  redditReconnect: "Reconnect",
  redditDisconnect: "Disconnect",
  redditWorking: "Updating Reddit connection…",
  redditNone: "No Reddit account is connected.",
  redditConnected: "Your Reddit account is connected.",
  redditExpired:
    "Reddit stopped accepting the saved session. Reconnect while this browser is signed in to Reddit.",
  redditUnreadable:
    "Threadsift can no longer open the saved session because its secret key changed.",
  redditMissing:
    "This Threadsift instance has no secret key to seal a session. You can’t connect a Reddit account until the instance owner sets one.",
  redditNoAccess:
    "The browser didn’t give the extension access to cookies and reddit.com, so nothing was sent.",
  redditSignedOut:
    "This browser isn’t signed in to Reddit in a normal window. Sign in to Reddit, then try again.",
  redditScopeRefused:
    "The saved agent token lacks the Reddit scope. Create one with the Read, Add and Reddit scopes in Threadsift Settings under Agent tokens. Then enter it in the Agent token field of Threadsift extension settings.",
  redditTokenRefused:
    "The saved agent token is wrong or was revoked. Replace it in the Agent token field of Threadsift extension settings.",
  redditUnreachable:
    "Couldn’t reach your Threadsift address. Check the address and your connection.",
  redditFailed: "Couldn’t update the Reddit connection, so nothing changed.",
  redditAccessKept:
    "Your Reddit account was removed from Threadsift, but the browser kept the extension’s cookie access. Select Disconnect again to remove it.",
  popupExpired:
    "Reddit no longer accepts the saved session. You need to be signed in to Reddit in this browser to reconnect.",
  manifestDescription:
    "Save the current page, or a Reddit thread with its comments, to your Threadsift reading library.",
  actionTitle: "Save to Threadsift",
  badgeSaved: "✓",
  badgeNotSaved: "!",
} as const;
