import { defineConfig } from "oxlint";

export default defineConfig({
  plugins: [
    "eslint",
    "typescript",
    "unicorn",
    "oxc",
    "import",
    "promise",
    "node",
    "react",
    "react-perf",
    "jsx-a11y",
  ],
  categories: {
    correctness: "error",
    suspicious: "error",
    perf: "error",
    pedantic: "error",
  },
  jsPlugins: [
    { name: "anti-slop", specifier: "./tools/oxlint/anti-slop/index.ts" },
    { name: "threadsift", specifier: "./tools/oxlint/threadsift/index.ts" },
  ],
  rules: {
    "threadsift/no-comments": "error",
    "typescript/ban-ts-comment": [
      "error",
      {
        "ts-expect-error": "allow-with-description",
        "ts-ignore": true,
        "ts-nocheck": true,
        "ts-check": false,
        minimumDescriptionLength: 10,
      },
    ],
    "unicorn/no-abusive-eslint-disable": "error",
    "eslint/no-inline-comments": [
      "error",
      { ignorePattern: "^\\s*(?:@vite-ignore|[#@]__(?:PURE|NO_SIDE_EFFECTS)__)\\s*$" },
    ],

    "typescript/consistent-type-assertions": ["error", { assertionStyle: "never" }],
    "typescript/no-non-null-assertion": "error",
    "typescript/no-explicit-any": "error",
    "typescript/prefer-readonly-parameter-types": [
      "error",
      { allow: [{ from: "package", name: "Context", package: "@oxlint/plugins" }] },
    ],
    "import/extensions": ["error", "always", { ignorePackages: true }],
    "import/no-unassigned-import": ["error", { allow: ["**/*.css"] }],

    "anti-slop/no-array-filter-map": "error",
    "anti-slop/no-reduce-accumulator-copy": "error",
    "anti-slop/no-conditional-empty-object-spread": "error",
    "anti-slop/no-known-value-widening": "error",
    "anti-slop/no-module-mocking": "error",
    "anti-slop/no-object-parameters": "error",
    "anti-slop/no-reflect-apply": "error",
    "anti-slop/no-reflect-get": "error",
    "anti-slop/no-runtime-typeof": "error",
    "anti-slop/no-shape-in-symbol-names": "error",
    "anti-slop/no-unknown-parameters": "error",
    "anti-slop/no-unknown-returns": "error",
    "anti-slop/no-unknown-type-aliases": "error",
    "anti-slop/no-unsafe-dictionary-type": "error",
    "anti-slop/require-readable-spacing": "error",
  },
  overrides: [{ files: ["*.config.ts", "tools/**"], env: { node: true } }],
  ignorePatterns: ["design/**", "tools/oxlint/anti-slop/**", ".claude/**"],
  options: {
    typeAware: true,
    typeCheck: true,
    denyWarnings: true,
    reportUnusedDisableDirectives: "error",
  },
});
