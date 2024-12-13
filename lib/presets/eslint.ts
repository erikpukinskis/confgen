import { getGithubWorkflow } from "./githubActions"
import type { CommandWithArgs, CommandGenerator } from "~/commands"
import type { JsonObject } from "~/helpers/json"
import { type Presets } from "~/presets"

export const generator: CommandGenerator = ({ presets }) => {
  const commands: CommandWithArgs[] = [
    {
      command: "yarn",
      dev: true,
      pkg: "eslint@8.29.0",
    },
    {
      command: "yarn",
      dev: true,
      pkg: "eslint-plugin-import",
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
      contents: getEslintrc(presets),
    },
    {
      command: "script",
      name: "check:lint",
      script:
        "eslint --ignore-path .gitignore --no-error-on-unmatched-pattern .; if [ $? -eq 0 ]; then echo 8J+OiSBObyBsaW50IGluIHRoaXMgY29kZSEKCg== | base64 -d; else exit 1; fi",
    },
    {
      command: "script",
      name: "fix:lint",
      script:
        "eslint --ignore-path .gitignore --no-error-on-unmatched-pattern . --fix; if [ $? -eq 0 ]; then echo 8J+OiSBObyBsaW50IGluIHRoaXMgY29kZSEKCg== | base64 -d; else exit 1; fi",
    },
  ]

  if (presets.includes("typescript")) {
    commands.push(
      {
        command: "yarn",
        dev: true,
        pkg: "@typescript-eslint/eslint-plugin@5.46.0",
      },
      { command: "yarn", dev: true, pkg: "@typescript-eslint/parser" },
      {
        command: "yarn",
        dev: true,
        pkg: "eslint-import-resolver-typescript",
      }
    )
  }

  if (presets.includes("react")) {
    commands.push({
      command: "yarn",
      dev: true,
      pkg: "eslint-plugin-react@7.31.11",
    })
  }

  if (presets.includes("codespaces")) {
    commands.push(
      {
        command: "file",
        path: ".devcontainer/devcontainer.json",
        contents: {
          extensions: ["dbaeumer.vscode-eslint"],
        },
      },
      {
        command: "file",
        path: ".vscode/settings.json",
        contents: {
          "editor.codeActionsOnSave": {
            "source.fixAll.eslint": "explicit",
          },
        },
      }
    )
  }

  if (presets.includes("githubActions")) {
    commands.push({
      command: "file",
      path: ".github/workflows/check-lint.yml",
      contents: getCheckLintWorkfow(),
      merge: "replace",
    })
  }

  return commands
}

const getCheckLintWorkfow = () => {
  return getGithubWorkflow({
    needsPackages: true,
    workflowName: "lint",
    jobs: [
      {
        jobName: "check",
        steps: [
          {
            run: "yarn build",
          },
          {
            run: "yarn check:lint",
          },
        ],
      },
    ],
  })
}

const getEslintrc = (presets: Presets): JsonObject => ({
  root: true,
  plugins: [
    "import",
    ...(presets.includes("typescript") ? ["@typescript-eslint"] : []),
  ],
  ignorePatterns: ["*.js"],
  ...(presets.includes("typescript")
    ? {
        parser: "@typescript-eslint/parser",
        parserOptions: {
          warnOnUnsupportedTypeScriptVersion: false,
          project: ["./tsconfig.json"],
        },
        // ignorePatterns: ["*.js"],
        settings: {
          "import/resolver": {
            typescript: true,
            node: true,
          },
        },
      }
    : undefined),
  extends: [
    "eslint:recommended",
    ...(presets.includes("react") ? ["plugin:react/recommended"] : []),
    ...(presets.includes("typescript")
      ? [
          "plugin:@typescript-eslint/eslint-recommended",
          "plugin:@typescript-eslint/recommended",
          "plugin:@typescript-eslint/recommended-requiring-type-checking",
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
          "@typescript-eslint/no-explicit-any": "error",
          "@typescript-eslint/consistent-type-imports": [
            "error",
            { prefer: "type-imports" },
          ],
          "no-unused-vars": "off",
          "@typescript-eslint/no-unused-vars": [
            "error",
            { args: "after-used", varsIgnorePattern: "^_+$" },
          ],
          "semi": ["error", "never"],
          // being released in eslint-plugin-import@2.27.0:
          // "import/consistent-type-specifier-style": ["error", "prefer-inline"],
        }
      : {
          "no-unused-vars": [
            "error",
            { args: "after-used", varsIgnorePattern: "^_+$" },
          ],
        }),
    ...(presets.includes("react") && presets.includes("typescript")
      ? {
          // Doesn't work that great with const Foo: SomeType = ... style components
          "react/prop-types": ["off"],
          "@typescript-eslint/no-misused-promises": [
            "error",
            {
              checksVoidReturn: {
                attributes: false,
              },
            },
          ],
        }
      : undefined),
    ...(presets.includes("react")
      ? {
          "react/react-in-jsx-scope": "off",
        }
      : undefined),
    "eol-last": ["error", "always"],
    "array-element-newline": ["off"],
    "import/order": [
      "error",
      {
        "alphabetize": { order: "asc", caseInsensitive: true },
        "newlines-between": "never",
      },
    ],
    "import/first": "error",
    "import/newline-after-import": "error",
    "import/no-duplicates": "error",
    "no-restricted-imports": [
      "error",
      {
        patterns: [".."],
      },
    ],
  },
})
