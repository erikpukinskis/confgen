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
    "script:check:lint": "eslint . --ext .ts,.tsx",
    "script:fix:lint": "eslint . --ext .ts,.tsx --fix",
    "file:.devcontainer/devcontainer.json": {
      "extensions": ["dbaeumer.vscode-eslint"],
    },
  },
  {
    command: "script",
    name: "check:lint",
    script: "eslint"
  },
  {
    command: "script",
    name: "fix:lint",
    script: "eslint --fix"
  },
  {
    command: "run",
    script: "npm run fix:lint"
  }
]

const buildEslintrc = (presets: Preset[]) => ({
  "root": true,
  ...(presets.includes("typescript")
    ? {
        "parser": "@typescript-eslint/parser",
        "plugins": ["@typescript-eslint"],
      }
    : undefined),
  "extends": [
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
        "settings": {
          "react": {
            "version": "detect",
          },
        },
      }
    : undefined),
  "rules": {
    ...(presets.includes("typescript")
      ? {
          "@typescript-eslint/no-explicit-any": ["error"],
          "@typescript-eslint/no-unused-vars": ["error"],
          "semi": ["error", "never"],
        }
      : undefined),
    "eol-last": ["error", "always"],
    "quote-props": ["error", "always"],
  },
  "ignorePatterns": ["*.js"],
})
