import { type Server, createServer } from "node:net";

import { z } from "zod";

const AddressSchema = z.object({ port: z.number().int().positive() });

export function onFreePort<Listener extends Server>(
  create: () => Listener,
): Promise<{ readonly server: Listener; readonly port: number }> {
  return new Promise((resolve, reject) => {
    const server = create();

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = AddressSchema.safeParse(server.address());

      if (address.success) resolve({ server, port: address.data.port });
      else reject(new Error("The server has no port."));
    });
  });
}

export async function freePort(): Promise<number> {
  const { server, port } = await onFreePort(() => createServer());

  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });

  return port;
}
