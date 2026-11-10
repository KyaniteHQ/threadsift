import { browser } from "wxt/browser";
import { defineUnlistedScript } from "wxt/utils/define-unlisted-script";

import { redditRefOf } from "../../src/core/links.ts";
import { FILL_PORT } from "../lib/state.ts";

export default defineUnlistedScript({
  main() {
    if (redditRefOf(location.href) !== null) browser.runtime.connect({ name: FILL_PORT });
  },
});
