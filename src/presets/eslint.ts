import { CommandGenerator, Preset } from "@/types"

export const eslint: CommandGenerator = (presets) => [
  {
    command: "yarn",
    dev: true,
    pkg: "eslint",
  },
  ...(presets.includes("typescript")
    ? ([
        {
          command: "yarn",
          dev: true,
          pkg: "@typescript-eslint/eslint-plugin",
        },
        { command: "yarn", dev: true, pkg: "@typescript-eslint/parser" },
      ] as const)
    : []),
  ...(presets.includes("react")
    ? ([
        {
          command: "yarn",
          dev: true,
          pkg: "eslint-plugin-react",
        },
      ] as const)
    : []),
  {
    command: "file",
    path: ".vscode/settings.json",
    contents: {
      "editor.codeActionsOnSave": {
        "source.fixAll.eslint": true,
      },
    },
  },
  {
    command: "file",
    path: ".eslintignore",
    contents: `node_modules
dist
vendor
`,
  },
  {
    command: "file",
    path: ".eslintrc",
    contents: buildEslintrc(presets),
  },
  ...(presets.includes("codespaces")
    ? ([
        {
          command: "file",
          path: ".devcontainer/devcontainer.json",
          contents: {
            extensions: ["dbaeumer.vscode-eslint"],
          },
        },
      ] as const)
    : []),
  {
    command: "script",
    name: "check:lint",
    script:
      "eslint --ignore-path .gitignore .; if [ $? -eq 0 ]; then echo 8J+OiSBObyBsaW50IGluIHRoaXMgY29kZSEKCg== | base64 -d; fi",
  },
  {
    command: "script",
    name: "fix:lint",
    script: "eslint --ignore-path .gitignore . --fix",
  },
  {
    command: "run",
    script: "npm run fix:lint",
  },
]

const buildEslintrc = (presets: Preset[]) => ({
  root: true,
  ...(presets.includes("typescript")
    ? {
        parser: "@typescript-eslint/parser",
        plugins: ["@typescript-eslint"],
      }
    : undefined),
  extends: [
    "eslint:recommended",
    ...(presets.includes("react") ? ["plugin:react/recommended"] : []),
    ...(presets.includes("typescript")
      ? [
          "plugin:@typescript-eslint/eslint-recommended",
          "plugin:@typescript-eslint/recommended",
        ]
      : []),
  ],
  ...(presets.includes("react")
    ? {
        settings: {
          react: {
            version: "detect",
          },
        },
      }
    : undefined),
  rules: {
    ...(presets.includes("typescript")
      ? {
          "@typescript-eslint/no-explicit-any": ["error"],
          "no-unused-vars": "off",
          "@typescript-eslint/no-unused-vars": ["error"],
          "semi": ["error", "never"],
        }
      : undefined),
    "eol-last": ["error", "always"],
    "quote-props": ["error", "consistent-as-needed"],
    "array-element-newline": ["off"],
  },
  ignorePatterns: ["*.js"],
})
