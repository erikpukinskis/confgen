import { describe, beforeAll, it, afterAll } from "vitest"
import { mkdirSync, rmdirSync, existsSync } from "fs"
import { execSync } from "child_process"
import { join } from "path"

describe("@dist", () => {
  const root = `/tmp/${randomFolder()}`
  const bin = join(__dirname, "..", "dist", "index.umd.js")

  const run = (command: string) => {
    if (!existsSync(bin)) {
      throw new Error(`${bin} does not exist`)
    }
    execSync(command, {
      cwd: root,
      stdio: "inherit",
    })
  }

  describe("a library with the basic formatting, linting, and env presets", () => {
    beforeAll(() => {
      console.log(
        `\n👷  Running confgen in test folder ${root} with binary ${bin}...`
      )
      mkdirSync(root)
      run(`${bin} lib git codespaces yarn typescript eslint prettier vitest`)
    })

    afterAll(() => {
      rmdirSync(root, { recursive: true })
    })

    it("can lint", () => {
      run("yarn check:lint")
    })
  })
})

const randomFolder = () => {
  const [, number] = Math.random().toString().split(".")
  return `confgen-${number}`
}
