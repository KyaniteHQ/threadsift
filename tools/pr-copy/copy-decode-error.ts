import { routeTemplate } from "./routes.ts";

export class CopyDecodeError extends Error {
  constructor(path: string, status: number) {
    super(`${routeTemplate(path)} answered ${String(status)} with a body that is not JSON`);
  }
}
