import { defineUnlistedScript } from "wxt/utils/define-unlisted-script";

import { capturePage } from "../lib/capture-page.ts";

export default defineUnlistedScript({ main: () => capturePage(document) });
