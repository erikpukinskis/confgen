import type { Contribution, ProduceContributions } from "../contributions"
import type { ProjectFacts } from "../facts"
import type { Selection } from "../selection"
import * as codedocs from "./codedocs"
import * as docker from "./docker"
import * as eslint from "./eslint"
import * as git from "./git"
import * as githubActions from "./githubActions"
import * as githubPackage from "./githubPackage"
import * as graphql from "./graphql"
import * as httpd from "./httpd"
import * as prettier from "./prettier"
import * as react from "./react"
import type { PresetName } from "./registry"
import * as typescript from "./typescript"
import * as vite from "./vite"
import * as vitest from "./vitest"
import * as vscode from "./vscode"
import * as yarn from "./yarn"

const producers = {
  yarn: yarn.contributions,
  vscode: vscode.contributions,
  typescript: typescript.contributions,
  vite: vite.contributions,
  vitest: vitest.contributions,
  eslint: eslint.contributions,
  prettier: prettier.contributions,
  react: react.contributions,
  graphql: graphql.contributions,
  docker: docker.contributions,
  httpd: httpd.contributions,
  // Prettier supplies SQL formatting when both presets are selected.
  sql: () => [],
  codedocs: codedocs.contributions,
  git: git.contributions,
  githubActions: githubActions.contributions,
  githubPackage: githubPackage.contributions,
} satisfies Record<PresetName, ProduceContributions>

export function presetContributions(
  preset: PresetName,
  selection: Selection,
  facts: ProjectFacts
): readonly Contribution[] {
  const produce = producers[preset]
  if (produce === undefined) {
    throw new Error(`Missing preset producer for ${preset}`)
  }
  return produce(selection, facts)
}
