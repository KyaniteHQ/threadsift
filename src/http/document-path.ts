import { SHARE_PATH } from "../core/share-address.ts";

export function isDocumentPath(pathname: string): boolean {
  return !pathname.slice(pathname.lastIndexOf("/") + 1).includes(".");
}

export function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

export function isServerPath(pathname: string): boolean {
  return isApiPath(pathname) || pathname === SHARE_PATH;
}
