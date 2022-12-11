import { getGithubWorkflow } from "./githubActions"
import type { CommandGenerator, CommandWithArgs } from "~/commands"

export const generator: CommandGenerator = ({ presets }) => {
  const commands: CommandWithArgs[] = [
    {
      command: "yarn",
      dev: true,
      pkg: "prettier@2.8.1",
    },
    {
      command: "file",
      path: ".prettierrc",
      contents: {
        semi: false,
        tabWidth: 2,
        quoteProps: "preserve",
      },
    },
    {
      command: "script",
      name: "fix:format",
      script: "prettier --write --ignore-path .gitignore .",
    },
    {
      command: "script",
      name: "check:format",
      script: "prettier --check --ignore-path .gitignore .",
    },
  ]

  if (presets.includes("codespaces")) {
    commands.push({
      command: "file",
      path: ".vscode/settings.json",
      contents: {
        "editor.codeActionsOnSave": {
          "source.formatDocument": true,
        },
        "editor.formatOnSave": true,
        "editor.defaultFormatter": "esbenp.prettier-vscode",
      },
    })
  }

  if (presets.includes("codespaces")) {
    commands.push({
      command: "file",
      path: ".devcontainer/devcontainer.json",
      contents: {
        extensions: [
          "rohit-gohri.format-code-action",
          "esbenp.prettier-vscode",
        ],
      },
    })
  }

  if (presets.includes("githubActions")) {
    commands.push({
      command: "file",
      path: ".github/workflows/check-code-format.yml",
      contents: getCheckFormatWorkflow(),
      merge: "replace",
    })
  }

  return commands
}

const getCheckFormatWorkflow = () =>
  getGithubWorkflow({
    needsPackages: true,
    workflowName: "Check code format",
    jobs: [
      {
        jobName: "check",
        steps: [
          {
            run: "yarn check:format",
          },
        ],
      },
    ],
  })
