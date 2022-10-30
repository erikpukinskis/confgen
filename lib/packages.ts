import difference from "lodash/difference"
import union from "lodash/union"
import { satisfies } from "semver"
import { runCommand, readJson, type PackageCommand } from "./commands"
import { type System } from "~/system"

export const swapDevPackages = (commands: PackageCommand[], system: System) => {
  const distPackages = currentlyInstalledPackages(false, system)
  const devPackages = currentlyInstalledPackages(true, system)

  const json = readJson("package.json", system)

  if (!ensureDependencies(json) || !ensureDevDependencies(json)) {
    throw new Error(
      "shouldn't be possible, this error is here to help the type checker"
    )
  }

  for (const command of commands) {
    if (command.dev && distPackages.includes(command.pkg)) {
      json.devDependencies[command.pkg] = json.dependencies[command.pkg]
      delete json.dependencies[command.pkg]
    } else if (!command.dev && devPackages.includes(command.pkg)) {
      json.dependencies[command.pkg] = json.devDependencies[command.pkg]
      delete json.devDependencies[command.pkg]
    }
  }

  if (Object.keys(json.dependencies).length < 1) {
    delete (json as Record<string, unknown>).dependencies
  }

  if (Object.keys(json.devDependencies).length < 1) {
    delete (json as Record<string, unknown>).devDependencies
  }

  system.write("package.json", json)
}

const ensureDevDependencies = (
  json: Record<string, unknown>
): json is { devDependencies: Record<string, string> } => {
  if (!json.devDependencies) {
    json.devDependencies = {}
  }
  return true
}

const ensureDependencies = (
  json: Record<string, unknown>
): json is { dependencies: Record<string, string> } => {
  if (!json.dependencies) {
    json.dependencies = {}
  }
  return true
}

/**
 * Takes an array of package commands and combines them into a single `yarn
 * add`. Skips packages already in the package.json unless they need to be
 * upgraded.
 */
export const runCombinedInstall = (
  commands: PackageCommand[],
  system: System
) => {
  const packages = packagesToAdd(system, commands)

  if (packages.length < 1) return

  return runCommand(
    {
      command: "yarn",
      dev: commands[0].dev,
      pkg: packages.join(" "),
    },
    system
  )
}

/**
 * Takes an array of package commands and returns an array of packages to add.
 * Any packages which are already in the package.json will be excluded, unless
 * they need to be upgraded.
 *
 * @returns An array of install directives, like "react" or "react@^18.0.0"
 */
export const packagesToAdd = (system: System, commands: PackageCommand[]) => {
  if (commands.length < 1) return []

  const isDev = Boolean(commands[0].dev)
  assertDev(commands, isDev)

  const packageNames = commands.map(({ pkg }) => pkg)
  const installedPackageNames = currentlyInstalledPackages(isDev, system)
  const packageNamesToUpgrade = packagesNeedingUpgrade(system, commands)
  const packageNamesToInstall = difference(packageNames, installedPackageNames)
  const packageNamesToAdd = union(packageNamesToInstall, packageNamesToUpgrade)

  const packages = []

  for (const { pkg, version } of commands) {
    if (!packageNamesToAdd.includes(pkg)) continue
    packages.push(`${pkg}${version ? `@${version}` : ""}`)
  }

  return packages
}

/**
 * Checks to make sure either:
 * A) all the commands are dev: true, or
 * B) all the commands are dev: false/undefined.
 *
 * Throws an error if there is a mixture of the two.
 */
const assertDev = (commands: PackageCommand[], isDev: boolean) => {
  for (const { pkg, dev } of commands) {
    if (Boolean(dev) !== isDev) {
      throw new Error(
        `packagesToInstall needs all dependencies to be either dev or not dev... ${
          commands[0].pkg
        } ${isDev ? "was" : "was not"} dev, but ${pkg} ${
          isDev ? "was not" : "was"
        }`
      )
    }
  }
}

const currentlyInstalledPackages = (isDev: boolean, system: System) => {
  const deps = readJson("package.json", system)[
    isDev ? "devDependencies" : "dependencies"
  ] as Record<string, string>

  return Object.keys(deps || {})
}

export const packagesNeedingUpgrade = (
  system: System,
  commands: PackageCommand[]
) => {
  const out: string[] = []
  system.run("yarn list | grep -Eo '[^ ]+@[0-9]+[.][0-9]+[.][0-9]+'", out)

  const currentVersion: Record<string, string> = {}

  for (const line of out) {
    const match = line.match(/^(.+)@([0-9]+[.][0-9]+[.][0-9]+)$/)
    if (!match) {
      throw new Error(`yarn list line does not look right: ${line}`)
    }
    const [, name, version] = match
    currentVersion[name] = version
  }

  const needUpgrade = []

  for (const { pkg, version } of commands) {
    if (!version) continue
    if (satisfies(currentVersion[pkg], version)) continue
    needUpgrade.push(pkg)
  }

  return needUpgrade
}
