import { type CommandGenerator } from "@/commands"
import type { Presets } from "@/presets"

export const generator: CommandGenerator = ({ presets }) => [
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
  {
    command: "file",
    path: ".devcontainer/devcontainer.json",
    contents: {
      extensions: ["erikpukinskis.chrome-codespaces-keymap", "stkb.rewrap"],
    },
  },
  ...(presets.includes("yarn")
    ? ([
        {
          command: "file",
          path: ".devcontainer/devcontainer.json",
          contents: {
            postCreateCommand: buildPostCreateCommand(presets),
          },
        },
      ] as const)
    : []),
]

const buildPostCreateCommand = (presets: Presets) => {
  let command = "yarn"
  if (presets.includes("githubPackage")) {
    command += " && yarn auth:registry"
  }
  return command
}
