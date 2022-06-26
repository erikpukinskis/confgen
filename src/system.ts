import { execSync } from "child_process"
import { existsSync, readFileSync } from "fs"
import { outputFileSync } from "fs-extra"
import { join } from "path"

export type System = {
  silent: boolean

  run(command: string): { status: number | null }
  exists(path: string): boolean
  read(path: string): string
  write(path: string, contents: string | object): void
  addPackage(pkg: string, isDevOnly: boolean): void
}

export class RealSystem implements System {
  silent = false
  cwd: string

  constructor({
    silent = false,
    cwd,
  }: { silent?: boolean; cwd?: string } = {}) {
    this.silent = silent
    this.cwd = cwd || ""
  }

  run(command: string) {
    try {
      execSync(command, {
        cwd: this.cwd,
        stdio: this.silent ? "ignore" : "inherit",
      })
      return { status: 0 }
    } catch (e: unknown) {
      return e as { status: number | null }
    }
  }
  exists(path: string) {
    return existsSync(join(this.cwd, path))
  }
  read(path: string) {
    return readFileSync(join(this.cwd, path)).toString()
  }
  write(path: string, contents: string | object) {
    outputFileSync(join(this.cwd, path), stringify(contents))
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
    return { status: null }
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

    const packageJson = JSON.parse(this.read("package.json")) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const depsKey = isDevOnly ? "devDependencies" : "dependencies"
    if (!packageJson[depsKey]) packageJson[depsKey] = {}
    const deps = packageJson[depsKey] as Record<string, string>

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
