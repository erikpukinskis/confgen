import { Configgen } from "./types"

export const eslint: Configgen = (presets) => ({
  "yarn:dev:eslint": "latest",
  ...(presets.includes("typescript")
    ? {
        "yarn:dev:@typescript-eslint/eslint-plugin": "latest",
        "yarn:dev:@typescript-eslint/parser": "latest",
      }
    : undefined),
  ...(presets.includes("react")
    ? { "yarn:dev:eslint-plugin-react": "latest" }
    : undefined),
  "file:.vscode/settings.json": {
    "editor.codeActionsOnSave": {
      "source.fixAll.eslint": true,
    },
  },
  "file:.eslintignore": `
    node_modules
    dist
    vendor
  `,
  "file:.eslintrc": {
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
  },
  "script:check:lint": "eslint . --ext .ts,.tsx",
  "script:fix:lint": "eslint . --ext .ts,.tsx --fix",
  "file:.devcontainer/devcontainer.json": {
    "extensions": ["dbaeumer.vscode-eslint"],
  },
})
