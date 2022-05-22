import { execSync } from "child_process"
import { existsSync, readFileSync } from "fs"
import { outputFileSync } from "fs-extra"
import { System } from "./types"
export { System } from "./types"

export class RealSystem implements System {
  silent = false

  run(command: string) {
    execSync(command, { stdio: "inherit" })
  }
  exists(path: string) {
    return existsSync(path)
  }
  read(path: string) {
    return readFileSync(path).toString()
  }
  write(path: string, contents: string | object) {
    outputFileSync(path, stringify(contents))
  }
  addPackage(pkg: string, isDevOnly: boolean) {
    const dashDev = isDevOnly ? "-D " : ""
    this.run(`yarn add ${dashDev}${pkg}`)
  }
}

export class MockSystem implements System {
  silent = true
  contentsByPath: Record<string, string> = {}

  run() {
    // noop
  }
  exists(path: string) {
    return Boolean(this.contentsByPath[path])
  }
  read(path: string) {
    return this.contentsByPath[path]
  }
  write(path: string, contents: string | object) {
    this.contentsByPath[path] = stringify(contents)
  }
  addPackage(pkgStrings: string, isDevOnly: boolean) {
    if (!this.exists("package.json")) {
      this.write("package.json", "{}")
    }

    const packageJson = JSON.parse(this.read("package.json"))
    const depsKey = isDevOnly ? "devDependencies" : "dependencies"
    if (!packageJson[depsKey]) packageJson[depsKey] = {}
    const deps: Record<string, string> = packageJson[depsKey]

    const pkgs = pkgStrings.split(" ")

    for (const pkg of pkgs) {
      const [name, version] = pkg.split("@")
      deps[name] = version || "*"
    }

    this.write("package.json", stringify(packageJson))
  }
}

const stringify = (contents: string | object) => {
  return typeof contents === "string"
    ? contents
    : JSON.stringify(contents, null, 2)
}
