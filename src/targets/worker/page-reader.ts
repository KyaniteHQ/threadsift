import { answerPage } from "../../core/page-answer.ts";
import { type PageReader, pageReaderOver } from "../../core/page-reader.ts";

const MAX_HTML_BYTES = 900 * 1024;

export const workerPageReader: PageReader = pageReaderOver(MAX_HTML_BYTES, { ask: answerPage });
