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
    "react/react-in-jsx-scope": "off",
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
    "unicorn/prefer-node-protocol": "error",
    "eslint/no-inline-comments": [
      "error",
      { ignorePattern: "^\\s*(?:@vite-ignore|[#@]__(?:PURE|NO_SIDE_EFFECTS)__)\\s*$" },
    ],

    "typescript/consistent-type-assertions": ["error", { assertionStyle: "never" }],
    "typescript/no-non-null-assertion": "error",
    "typescript/no-explicit-any": "error",
    "typescript/prefer-readonly-parameter-types": [
      "error",
      {
        ignoreInferredTypes: true,
        allow: [
          { from: "package", name: ["Context", "ImportExpression"], package: "@oxlint/plugins" },
          { from: "file", name: "Database" },
          { from: "package", name: "ZodError", package: "zod" },
          {
            from: "package",
            name: ["DatabaseSync", "IncomingMessage", "ErrnoException"],
            package: "@types/node",
          },
          {
            from: "lib",
            name: [
              "Request",
              "HTMLElement",
              "EventTarget",
              "AbortSignal",
              "URL",
              "ReadableStream",
              "AsyncIterable",
            ],
          },
          {
            from: "package",
            name: ["RefObject", "ChangeEvent", "SubmitEvent"],
            package: "@types/react",
          },
        ],
      },
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
  overrides: [
    { files: ["*.config.ts", "tools/**"], env: { node: true } },
    {
      files: ["e2e/**"],
      rules: {
        "eslint/no-await-in-loop": "off",
        "typescript/prefer-readonly-parameter-types": "off",
      },
    },
    {
      files: ["src/core/**", "src/http/**"],
      rules: {
        "threadsift/static-import-source": "error",
        "eslint/no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                regex: "^(node|cloudflare):",
                message:
                  "src/core/ and src/http/ run on both targets; a runtime module belongs in an adapter under src/targets/ (docs/architecture.md, One codebase, two install targets).",
              },
              {
                regex: "(^|[/#@])targets(/|$)",
                message:
                  "src/core/ and src/http/ never import an adapter; the target entry passes ports in through createApp(ports).",
              },
            ],
          },
        ],
      },
    },
    {
      files: ["src/core/**", "src/http/**", "web/**"],
      rules: {
        "eslint/no-restricted-globals": [
          "error",
          ...["process", "Buffer", "global", "__dirname", "__filename", "require"].map((name) => ({
            name,
            message:
              "Node globals do not exist on the Worker or in the browser; src/core/, src/http/ and web/ run there (docs/architecture.md, One codebase, two install targets).",
          })),
        ],
      },
    },
    {
      files: ["web/**"],
      rules: {
        "eslint/no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                regex: "^(node|cloudflare):",
                message: "web/ runs in the browser, so it imports no runtime module.",
              },
            ],
          },
        ],
      },
    },
  ],
  ignorePatterns: ["design/prototype/**", "tools/oxlint/anti-slop/**", ".claude/**"],
  options: {
    typeAware: true,
    typeCheck: true,
    denyWarnings: true,
    reportUnusedDisableDirectives: "error",
  },
});
