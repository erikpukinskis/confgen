import type {
  Contribution,
  JsonValue,
  ProduceContributions,
} from "../contributions.js"

/** VS Code owns editor configuration. */
export const contributions: ProduceContributions = (selection) =>
  selection.presets.includes("yarn")
    ? [
        setting("typescript.tsdk", ".yarn/sdks/typescript/lib"),
        setting("typescript.enablePromptUseWorkspaceTsdk", true),
      ]
    : []

function setting(name: string, value: JsonValue): Contribution {
  return {
    id: `vscode:setting:${name}`,
    source: "preset:vscode",
    kind: "structured",
    path: ".vscode/settings.json",
    format: "json",
    address: [name],
    value,
    update: "replace",
  }
}
