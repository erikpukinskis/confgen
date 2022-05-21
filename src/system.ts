import { execSync } from "child_process"
import { existsSync, readFileSync } from "fs"
import { outputFileSync } from "fs-extra"

export type System = {
  silent: boolean

  run(command: string): void
  exists(path: string): boolean
  read(path: string): string
  write(path: string, contents: string): void
  addPackage(pkg: string, isDevOnly: boolean): void
}

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
  write(path: string, contents: string) {
    outputFileSync(path, contents)
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
  write(path: string, contents: string) {
    this.contentsByPath[path] = contents
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

    this.write("package.json", JSON.stringify(packageJson, null, 2))
  }
}
