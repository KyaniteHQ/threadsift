import { recordingFetcher } from "../fetcher-record.ts";

export const asked: string[] = [];

export default recordingFetcher(asked);
