import { type Instance, mainInstance } from "./access.ts";

export function isContainerTarget(): boolean {
  return process.env["THREADSIFT_TARGET"] === "container";
}

export function nodeInAppNetwork(instance: Instance = mainInstance()): {
  command: string;
  args: string[];
} {
  const words = instance.appExec.split(" ").filter((word) => word !== "");

  return words.length === 0
    ? { command: "node", args: [] }
    : { command: words[0] ?? "", args: [...words.slice(1), "node"] };
}
