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
  } else {
    console.log("no ADDD workflow")
  }

  return commands
}

const getCheckFormatWorkflow = () => ({
  name: "Check code format",
  on: "push",
  jobs: {
    check: {
      "runs-on": "ubuntu-latest",
      "steps": [
        {
          name: "Check out",
          uses: "actions/checkout@v3",
        },
        {
          name: "Set up Yarn cache",
          uses: "actions/setup-node@v3",
          with: {
            "node-version": "16",
            "cache": "yarn",
          },
        },
        {
          run: "yarn install --frozen-lockfile",
        },
        {
          run: "yarn check:format",
        },
      ],
    },
  },
})
