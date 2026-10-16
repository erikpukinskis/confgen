import type { Contribution, ProduceContributions } from "../contributions.js"
import type { ProjectFacts } from "../facts.js"
import type { Selection } from "../selection.js"
import * as codedocs from "./codedocs.js"
import * as docker from "./docker.js"
import * as eslint from "./eslint.js"
import * as git from "./git.js"
import * as githubActions from "./githubActions.js"
import * as githubPackage from "./githubPackage.js"
import * as graphql from "./graphql.js"
import * as httpd from "./httpd.js"
import * as prettier from "./prettier.js"
import * as react from "./react.js"
import type { PresetName } from "./registry.js"
import * as sql from "./sql.js"
import * as typescript from "./typescript.js"
import * as vite from "./vite.js"
import * as vitest from "./vitest.js"
import * as yarn from "./yarn.js"

const producers = {
  yarn: yarn.contributions,
  typescript: typescript.contributions,
  vite: vite.contributions,
  vitest: vitest.contributions,
  eslint: eslint.contributions,
  prettier: prettier.contributions,
  react: react.contributions,
  graphql: graphql.contributions,
  docker: docker.contributions,
  httpd: httpd.contributions,
  sql: sql.contributions,
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
