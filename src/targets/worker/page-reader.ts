import { type PageReader, pageReaderOver } from "../../core/kernel/page-reader.ts";
import { answerPage } from "../../features/fetch/core/page-answer.ts";

const MAX_HTML_BYTES = 900 * 1024;

export const workerPageReader: PageReader = pageReaderOver(MAX_HTML_BYTES, { ask: answerPage });
