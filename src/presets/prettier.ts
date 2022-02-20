import { CommandGenerator } from "@/types"

export const prettier: CommandGenerator = (presets) => [
  {
    command: "yarn",
    dev: true,
    pkg: "prettier",
  },
  {
    command: "file",
    path: ".vscode/settings.json",
    contents: {
      "editor.codeActionsOnSave": {
        "source.formatDocument": true,
      },
      "editor.formatOnSave": false,
      "editor.defaultFormatter": "esbenp.prettier-vscode",
    },
  },
  {
    command: "file",
    path: ".prettierrc",
    contents: {
      "semi": false,
      "tabWidth": 2,
      "quoteProps": "preserve",
    },
  },
  {
    command: "script",
    name: "fix:format",
    script: "prettier --write --ignore-path=.gitignore .",
  },
  ...(presets.includes("codespaces")
    ? ([
        {
          command: "file",
          path: ".devcontainer/devcontainer.json",
          contents: {
            "extensions": [
              "rohit-gohri.format-code-action",
              "esbenp.prettier-vscode",
            ],
          },
        },
      ] as const)
    : []),
  {
    command: "run",
    script: "yarn run fix:format",
  },
]
