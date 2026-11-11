export function words(marker: string): string {
  const sentence =
    "A fetcher plug-in read this page for the Instance and returned its text, so the Reader shows it as the saved post text of the link.";

  return `${Array.from({ length: 6 }, () => sentence).join("\n\n")}\n\nThe marker of this plug-in is ${marker}.`;
}

export function hostOf(url: string): string {
  return new URL(url).hostname;
}
