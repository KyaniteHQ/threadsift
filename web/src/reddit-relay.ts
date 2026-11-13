import {
  type Posted,
  RELAY_PRESENCE_MS,
  RELAY_RESULT_MS,
  type RedditConnectState,
  relayRequest,
  replyTo,
} from "../../src/core/reddit-relay-contract.ts";

export function askExtension(): Promise<RedditConnectState | null> {
  const id = crypto.randomUUID();

  return new Promise((resolve) => {
    const listening = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (state: RedditConnectState | null): void => {
      clearTimeout(timer);
      listening.abort();
      resolve(state);
    };

    const wait = (ms: number): void => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        finish(null);
      }, ms);
    };

    wait(RELAY_PRESENCE_MS);

    window.addEventListener(
      "message",
      ({ source, origin, data }: Readonly<Posted>) => {
        const reply = source === window && origin === location.origin ? replyTo(data, id) : null;

        if (reply?.kind === "working") wait(RELAY_RESULT_MS);

        if (reply?.kind === "state") finish(reply.state);
      },
      { signal: listening.signal },
    );

    window.postMessage(relayRequest(id), location.origin);
  });
}
