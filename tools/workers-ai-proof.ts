export const PROOF_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

export function workersAiUrl(account: string): string {
  return `https://api.cloudflare.com/client/v4/accounts/${account}/ai/v1`;
}
