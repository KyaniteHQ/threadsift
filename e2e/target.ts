import { mainInstance } from "./access.ts";

export function isContainerTarget(): boolean {
  return process.env["THREADSIFT_TARGET"] === "container";
}

export function nodeInAppNetwork(): { command: string; args: string[] } {
  const words = mainInstance()
    .appExec.split(" ")
    .filter((word) => word !== "");

  return words.length === 0
    ? { command: "node", args: [] }
    : { command: words[0] ?? "", args: [...words.slice(1), "node"] };
}
