import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createSystem } from "./system.js"
import { main } from "./index.js"
import { expect, test } from "vitest"

test("a file-writing selection exits successfully", async () => {
  const cwd = await project()
  const stderr = capture()
  const stdout = capture()

  const status = await main(cli("runtimes=#lib", "git"), cwd, stderr, stdout)

  expect(status).toBe(0)
  expect(stderr.text).toBe("")
  expect(stdout.text).toBe("")
})

test("invalid selections exit with every diagnostic", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "confgen-cli-"))
  const stderr = capture()
  const stdout = capture()

  const status = await main(
    cli("runtimes=#lib,#lib,#nope", "nope", "vitest", "vitest"),
    cwd,
    stderr,
    stdout
  )

  expect(status).toBe(1)
  expect(stdout.text).toBe("")
  expect(stderr.text).toBe(
    diagnostic([
      'Duplicate runtime "lib".',
      'Unknown runtime "nope".',
      'Unknown preset "nope".',
      'Duplicate preset "vitest".',
    ])
  )
})

test("a missing runtime group exits with a diagnostic", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "confgen-cli-"))
  const stderr = capture()

  const status = await main(cli(), cwd, stderr, capture())

  expect(status).toBe(1)
  expect(stderr.text).toBe(
    diagnostic(["Missing runtime group. Expected runtimes=#name[,#name...]."])
  )
})

test("manifest failures exit with the field and file", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "confgen-cli-"))
  const system = createSystem(cwd)
  await system.writeFile("package.json", JSON.stringify({ version: "1.0.0" }))
  const stderr = capture()

  const status = await main(
    cli("runtimes=#lib", "typescript"),
    cwd,
    stderr,
    capture()
  )

  expect(status).toBe(1)
  expect(stderr.text).toBe(
    diagnostic([
      "package.json: name: Invalid input: expected string, received undefined",
    ])
  )
})

function cli(...args: string[]): string[] {
  return ["node", "confgen", ...args]
}

function diagnostic(lines: readonly string[]): string {
  return lines.map((line) => `confgen: ${line}\n`).join("")
}

function capture(): { write(data: string): void; text: string } {
  const writer = {
    text: "",
    write(data: string) {
      writer.text += data
    },
  }
  return writer
}

async function project(): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), "confgen-cli-"))
  await createSystem(cwd).writeFile(
    "package.json",
    JSON.stringify({ name: "example" })
  )
  return cwd
}
