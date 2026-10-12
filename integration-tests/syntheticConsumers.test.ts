import { fileURLToPath } from "node:url"
import {
  createSyntheticProject,
  packConfgen,
  readScenario,
  readyPort,
  type PackedConfgen,
} from "./helpers.js"
import { afterAll, beforeAll, expect, test } from "vitest"

const fixture = fileURLToPath(new URL("./fixtures/baseline/", import.meta.url))

let packed: PackedConfgen | undefined

beforeAll(async () => {
  packed = await packConfgen()
})

afterAll(async () => {
  await packed?.cleanup()
})

test("the packed baseline installs, checks, serves, and reruns cleanly", async () => {
  const bundle = packed
  if (bundle === undefined) throw new Error("Confgen was not packed")
  const args = await readScenario(fixture)
  const project = await createSyntheticProject({
    tarball: bundle.tarball,
    fixture,
  })
  try {
    await project.run("yarn", ["confgen", ...args], 180_000)
    await project.run("yarn", ["install"], 180_000)
    await project.run("yarn", ["build"], 180_000)
    await project.run("yarn", ["check:types"])
    await project.run("yarn", ["check:lint"])
    await project.run("yarn", ["check:format"])
    await project.run("yarn", ["test"])
    const running = await project.start("yarn", ["start"], {
      ready: (stdout) => stdout.includes("ready http://127.0.0.1:"),
      timeoutMs: 30_000,
      env: { PORT: "0" },
    })
    try {
      const response = await fetch(
        `http://127.0.0.1:${readyPort(running.stdout)}/`
      )
      expect(response.status).toBe(200)
      expect(await response.text()).toBe("Hello, baseline\n")
    } finally {
      await running.stop()
    }
    await project.run("git", ["init"])
    await project.run("git", ["add", "--all"])
    await project.run("git", [
      "-c",
      "user.email=confgen@example.com",
      "-c",
      "user.name=Confgen",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-m",
      "baseline",
    ])
    await project.run("yarn", ["confgen"], 180_000)
    const status = await project.run("git", ["status", "--porcelain"])
    expect(status.stdout).toBe("")
  } finally {
    await project.cleanup()
  }
})
