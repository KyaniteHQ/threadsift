import type { IncomingMessage } from "node:http";

import type { HttpBindings } from "@hono/node-server";
import type { MiddlewareHandler } from "hono";

export const MAX_DISCARD_BYTES = 64 * 1024 * 1024;

function discardBody(incoming: IncomingMessage): Promise<boolean> {
  return new Promise((resolve) => {
    let bytes = 0;

    function finish(complete: boolean): void {
      incoming.off("data", onData);
      incoming.off("end", onEnd);
      incoming.off("close", onClose);
      resolve(complete);
    }

    function onData(chunk: Readonly<{ length: number }>): void {
      bytes += chunk.length;

      if (bytes > MAX_DISCARD_BYTES) {
        finish(false);
      }
    }

    function onEnd(): void {
      finish(true);
    }

    function onClose(): void {
      finish(incoming.complete);
    }

    if (incoming.destroyed) {
      resolve(incoming.complete);

      return;
    }

    incoming.removeAllListeners("data");
    incoming.on("data", onData);
    incoming.on("end", onEnd);
    incoming.on("close", onClose);
    incoming.resume();
  });
}

export const answerAfterBody: MiddlewareHandler<{ Bindings: HttpBindings }> = async (
  context,
  next,
) => {
  await next();

  const { incoming } = context.env;

  if (incoming.complete) {
    return;
  }

  const discarded = await discardBody(incoming);

  if (context.env.outgoing.destroyed) {
    await context.res.body?.cancel();
    context.res = new Response(null, { status: context.res.status });

    return;
  }

  if (!discarded) {
    context.header("Connection", "close");
  }
};
