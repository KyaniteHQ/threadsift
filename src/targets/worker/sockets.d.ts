declare module "cloudflare:sockets" {
  export interface Socket {
    readonly readable: ReadableStream<Uint8Array>;
    readonly writable: WritableStream<Uint8Array>;
    readonly opened: Promise<unknown>;
    close(): Promise<void>;
  }

  export function connect(
    address: Readonly<{ hostname: string; port: number }>,
    options?: Readonly<{ secureTransport?: "on" | "off" | "starttls"; allowHalfOpen?: boolean }>,
  ): Socket;
}
