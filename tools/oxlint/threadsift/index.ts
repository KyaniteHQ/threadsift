import { eslintCompatPlugin } from "@oxlint/plugins";

import { noAwaitBeforeRethrowRule } from "./rules/no-await-before-rethrow.ts";
import { noCommentsRule } from "./rules/no-comments.ts";
import { noServerValueImportRule } from "./rules/no-server-value-import.ts";
import { staticImportSourceRule } from "./rules/static-import-source.ts";

export default eslintCompatPlugin({
  meta: { name: "threadsift" },
  rules: {
    "no-await-before-rethrow": noAwaitBeforeRethrowRule,
    "no-comments": noCommentsRule,
    "no-server-value-import": noServerValueImportRule,
    "static-import-source": staticImportSourceRule,
  },
});
