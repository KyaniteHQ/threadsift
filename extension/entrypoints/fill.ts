import { browser } from "wxt/browser";
import { defineUnlistedScript } from "wxt/utils/define-unlisted-script";

import { redditRefOf } from "../../src/core/links.ts";
import { FILL_PORT } from "../lib/state.ts";

function reportThread(): void {
  if (redditRefOf(location.href) !== null) browser.runtime.connect({ name: FILL_PORT });
}

export default defineUnlistedScript({
  main() {
    reportThread();
    window.navigation.addEventListener("currententrychange", reportThread);
  },
});
