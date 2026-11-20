import type { RequestHeaders } from "../kernel/network.ts";

export const GITHUB_API_ORIGIN = "https://api.github.com";

export const GITHUB_API_HEADERS: RequestHeaders = {
  accept: "application/vnd.github+json",
  "x-github-api-version": "2022-11-28",
};
