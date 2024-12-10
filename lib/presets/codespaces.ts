import { Command, CommandWithArgs, type CommandGenerator } from "~/commands"
import type { Presets } from "~/presets"

export const generator: CommandGenerator = ({ presets }) => {
  const commands: CommandWithArgs[] = [
    {
      command: "file",
      path: ".devcontainer/devcontainer.json",
      contents: {
        extensions: ["erikpukinskis.chrome-codespaces-keymap", "stkb.rewrap"],
      },
    },
    {
      command: "file",
      path: ".vscode/settings.json",
      contents: {
        "workbench.startupEditor": "none",
        "workbench.colorTheme": "GitHub Dark",
        "workbench.colorCustomizations": {
          "[GitHub Dark]": {
            "tab.inactiveBackground": "#121416",
            "tab.activeBorderTop": "#24292E",
          },
        },
        "editor.tabSize": 2,
        "editor.insertSpaces": true,
        "editor.detectIndentation": false,
      },
    },
  ]

  if (presets.includes("yarn")) {
    commands.push({
      command: "file",
      path: ".devcontainer/devcontainer.json",
      contents: {
        postCreateCommand: getPostCreateCommand(presets),
      },
    })
  }

  return commands
}

const getPostCreateCommand = (presets: Presets) => {
  let command = "yarn"
  if (presets.includes("githubPackage")) {
    command += " && yarn auth:registry"
  }
  return command
}
