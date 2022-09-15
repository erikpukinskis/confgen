import { describe, beforeAll, it, afterAll } from "vitest"
import { mkdirSync, rmSync, existsSync } from "fs"
import { execSync } from "child_process"
import { join } from "path"

describe("@build", () => {
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
      console.log(`\n👷  Running in test folder ${root} with binary ${bin}...`)
      mkdirSync(root)
      run(
        `${bin} @lib --silent --name TestPackage git codespaces yarn typescript eslint prettier vitest vite dist:lib`
      )
    })

    afterAll(() => {
      rmSync(root, { recursive: true })
    })

    it("can build", () => {
      run("yarn build")
    })
  })
})

const randomFolder = () => {
  const [, number] = Math.random().toString().split(".")
  return `confgen-${number}`
}
