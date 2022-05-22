import { describe, beforeAll, it, afterAll } from "vitest"
import { mkdirSync, rmdirSync } from "fs"
import { execSync } from "child_process"
import { join } from "path"

describe("@dist", () => {
  const root = `/tmp/${randomFolder()}`
  const bin = join(__dirname, "..", "..", "dist", "index.umd.js")

  const run = (command: string) => {
    execSync(command, {
      cwd: root,
      stdio: "inherit",
    })
  }

  beforeAll(() => {
    mkdirSync(root)
    run(`${bin} git codespaces yarn typescript eslint prettier vitest`)
    console.log(`\n👷  Ran confgen in ${root} with binary ${bin}`)
  })

  afterAll(() => {
    rmdirSync(root, { recursive: true })
  })

  it("can lint", () => {
    run("yarn check:lint")
  })
})

const randomFolder = () => {
  const [, number] = Math.random().toString().split(".")
  return `confgen-${number}`
}
