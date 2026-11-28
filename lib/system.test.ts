import { mkdtemp, readdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { CommandError, createSystem } from "./system"
import { expect, test } from "vitest"

test("reads and writes files in the project directory", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "confgen-system-"))
  const system = createSystem(cwd)

  await system.writeFile("nested/note.txt", "hello")
  expect(await system.readFile("nested/note.txt")).toBe("hello")
  await system.removeFile("nested/note.txt")
  expect(await readdir(join(cwd, "nested"))).toEqual([])
})

test("runs an executable with arguments and does not invoke a shell", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "confgen-system-"))
  const system = createSystem(cwd)
  const argument = "ok && $(not-a-command)"

  const result = await system
    .run(process.execPath, [
      "-e",
      "process.stdout.write(process.argv[1])",
      argument,
    ])
    .waitForExit()

  expect(result.status).toBe(0)
  expect(result.stdout).toBe(argument)
  expect(result.stderr).toBe("")
})

test("renames a file into place", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "confgen-system-"))
  const system = createSystem(cwd)

  await system.writeFile("confgen.lock.tmp", "next\n")
  await system.rename("confgen.lock.tmp", "confgen.lock")

  expect(await system.readFile("confgen.lock")).toBe("next\n")
  await expect(system.readFile("confgen.lock.tmp")).rejects.toThrow()
})

test("throws when the executable fails", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "confgen-system-"))
  const system = createSystem(cwd)

  const failing = system.run(process.execPath, ["-e", "process.exit(3)"])

  await expect(failing.waitForExit()).rejects.toThrow(CommandError)
  await expect(failing.next()).rejects.toThrow(CommandError)
})

test("reads output one line at a time", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "confgen-system-"))
  const system = createSystem(cwd)

  const running = system.run(process.execPath, [
    "-e",
    "console.log('one\\ntwo'); setTimeout(() => console.error('three'), 50)",
  ])

  expect(await running.next()).toMatchObject({ stdout: "one" })
  expect(await running.next()).toMatchObject({ stdout: "two" })
  expect(await running.next()).toMatchObject({ stderr: "three" })
  expect(await running.next()).toEqual({ status: 0 })
})

test("stops a running process", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "confgen-system-"))
  const system = createSystem(cwd)

  const running = system.run(process.execPath, [
    "-e",
    "console.log('ready'); setInterval(() => {}, 1000)",
  ])

  expect(await running.next()).toMatchObject({ stdout: "ready" })
  await running.stop()
})
