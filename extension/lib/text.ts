export const TEXT = {
  saving: "Saving…",
  saved: "Saved",
  savedIncomplete: "The thread was saved. Some replies weren’t included.",
  savedPage: "Couldn’t read the thread. The item was saved without comments.",
  openItem: "Open in Threadsift",
  notConfigured: "Add your Threadsift address and agent token to save pages.",
  openSettings: "Open settings",
  accessMissing:
    "The extension doesn’t have permission to reach your Threadsift address. Select Save settings in Threadsift extension settings so your browser asks for access.",
  pageBlocked:
    "Couldn’t read this page. It may not be a web page, or the browser may block extensions on it.",
  tokenRefused: "Threadsift rejected the saved agent token. It is wrong or was revoked.",
  scopeRefused:
    "Couldn’t save this page. The saved agent token needs the Read and Add scopes. Create a token with them under Agent tokens in Threadsift’s Settings, then enter it in Threadsift extension settings.",
  tooLarge: "The text on this page is too long to save.",
  privateLink: "This page can’t be saved. Its address isn’t reachable from the public internet.",
  unsupportedLink:
    "The extension can’t save this page. It doesn’t save X pages, GitHub pages, short links or Reddit share links. On Reddit, it saves only posts and comments.",
  budgetSpent:
    "Couldn’t save this page. The saved agent token reached its daily budget. You can raise it with Change budget under Agent tokens in Threadsift’s Settings. Otherwise, saving works again after 00:00 UTC.",
  threadKept: "Couldn’t read this Reddit thread. The saved item in Threadsift stays as it was.",
  unreachable: "Couldn’t reach your Threadsift address. Check the address and your connection.",
  nameNotFound:
    "Couldn’t save this page. The browser couldn’t find the Threadsift address’s name. Check your network and the address in Threadsift extension settings.",
  connectionRefused:
    "Couldn’t save this page. Nothing at the Threadsift address accepted the connection. Check that Threadsift is running.",
  timedOut:
    "Couldn’t save this page. The Threadsift address didn’t answer in time. Try again in a moment.",
  secureConnection:
    "Couldn’t save this page. The browser couldn’t make a secure connection to the Threadsift address. Check the address and its certificate in Threadsift extension settings.",
  failed: "Couldn’t save this page.",
  tryAgain: "Try again",
  settingsTitle: "Threadsift extension settings",
  addressLabel: "Threadsift address",
  addressHint: "Use an https:// address, or http:// only for localhost or 127.0.0.1.",
  addressInvalid: "Enter an https:// address, or http:// for localhost or 127.0.0.1.",
  tokenLabel: "Agent token",
  tokenKept:
    "A token is saved for the current address. Leave this field empty to keep it while the address stays the same, or enter a new one to replace it. If you change the address, enter its token.",
  tokenHint:
    "Create one with the Read and Add scopes under Agent tokens in Threadsift’s Settings. Include the Reddit scope to connect a Reddit account.",
  tokenMissing: "Enter an agent token.",
  tokenForNewAddress:
    "Settings weren’t saved. The extension doesn’t send the saved token to another address. Enter the agent token for the new address.",
  saveSettings: "Save settings",
  checkWorks: "Settings saved. Your Threadsift instance answered, and the agent token works.",
  checkNameNotFound:
    "Settings saved. The browser couldn’t find the address’s name. Check the spelling of the address and whether your network can look it up.",
  checkConnectionRefused:
    "Settings saved. Nothing at that address accepted the connection. Check that Threadsift is running there and the port in the address is right.",
  checkTimedOut:
    "Settings saved. The address didn’t answer in time. Check the address and your connection, then try Save settings again.",
  checkSecureConnection:
    "Settings saved. The browser couldn’t make a secure connection because the address doesn’t support https or its certificate was refused. Check that the address uses https only when your instance serves it, and that the certificate is valid.",
  checkUnreachable:
    "Settings saved. Couldn’t connect to the address. Check the address and your connection.",
  checkNotInstance:
    "Settings saved. Something answered at that address, but it isn’t a Threadsift instance. Check that the address is your instance’s own and accepts agent tokens.",
  checkInstanceOutdated:
    "Settings saved. A Threadsift instance answered, but it’s older than the extension and doesn’t support this check. Update your instance, though saving pages may still work.",
  checkTokenRefused:
    "Settings saved. Threadsift rejected the agent token because it is wrong or was revoked. Enter a new one.",
  checkScopeRefused:
    "Settings saved. The agent token needs the Read and Add scopes. Create a token with them under Agent tokens in Threadsift’s Settings, then enter it here.",
  checkFailed:
    "Settings saved. Couldn’t finish checking the address. Try Save settings again later.",
  checkStale:
    "Settings saved. You changed the fields while the check ran, so its result no longer matches them. Select Save settings again to save and check what the fields hold now.",
  settingsNotSaved: "Couldn’t save the settings, so nothing changed. Try again.",
  accessNotRemoved:
    "The browser couldn’t remove the extension’s access to the previous address. You can remove it in the browser’s extension settings.",
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
  redditUnreadable: "Threadsift can’t open the saved Reddit session.",
  redditMissing:
    "This Threadsift instance has no secret key to seal a session. You can’t connect a Reddit account until the instance owner sets one.",
  redditNoAccess:
    "The extension doesn’t have the browser permissions it needs, so nothing was sent. Connect Reddit asks for access to cookies and reddit.com. Save settings asks for access to your Threadsift address.",
  redditSignedOut:
    "This browser isn’t signed in to Reddit in a normal window. Sign in to Reddit, then try again.",
  redditScopeRefused:
    "The saved agent token is missing the Read or Reddit scope. Create a token with the Read, Add and Reddit scopes under Agent tokens in Threadsift’s Settings. Then enter it in the Agent token field of Threadsift extension settings.",
  redditTokenRefused:
    "The saved agent token is wrong or was revoked. Replace it in the Agent token field of Threadsift extension settings.",
  redditUnreachable:
    "Couldn’t reach your Threadsift address. Check the address and your connection.",
  redditFailed:
    "Couldn’t finish updating the Reddit connection. Reload the page to check whether it changed.",
  redditReadFailed: "Couldn’t check whether a Reddit account is connected. Reload the page.",
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
