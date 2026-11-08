import { connect } from "node:net";

import { expect, test } from "@playwright/test";

import { mainInstance } from "./access.ts";
import { inContainer } from "./files.ts";
import { isContainerTarget } from "./target.ts";

const CLIENTS = 3;
const ASSET = /\/assets\/index-[\w-]+\.js/u;

test.skip(!isContainerTarget(), "only the container serves the built assets through Node");

function openHandles(asset: string): number {
  return Number(
    inContainer(
      mainInstance(),
      `ls -l /proc/1/fd | grep -c ${asset.replace("/assets/", "")} || true`,
    ).trim(),
  );
}

test("a client that disconnects while the Instance reads its unneeded request body does not leave the built asset open", async ({
  baseURL,
  request,
}) => {
  const page = await (await request.get("/")).text();
  const asset = ASSET.exec(page)?.[0] ?? "";

  expect(asset).not.toBe("");
  expect(openHandles(asset)).toBe(0);

  const { hostname, port } = new URL(baseURL ?? "");

  for (let client = 1; client <= CLIENTS; client += 1) {
    const socket = connect(Number(port), hostname);

    socket.write(
      `GET ${asset} HTTP/1.1\r\nHost: ${hostname}\r\nContent-Length: 1000000\r\n\r\n${"x".repeat(1000)}`,
    );

    await expect.poll(() => openHandles(asset), `client ${client} waiting`).toBe(1);

    socket.destroy();

    await expect.poll(() => openHandles(asset), `client ${client} gone`).toBe(0);
  }
});
