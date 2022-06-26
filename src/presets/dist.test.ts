import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { Project } from "@/project"
import { MockSystem, RealSystem, type System } from "@/system"
import { mkdirSync, rmdirSync } from "fs"

const randomFolder = () => {
  const [, number] = Math.random().toString().split(".")
  return `confgen-${number}`
}

describe("presets/dist", () => {
  describe("a real system", () => {
    let system: System
    const root = `/tmp/${randomFolder()}`

    beforeAll(() => {
      system = new RealSystem({ silent: true, cwd: root })
      mkdirSync(root)
      const project = new Project({
        system,
        builds: ["lib"],
        presetConfigs: ["yarn", "typescript", "vite", "dist:lib"],
      })
      project.confgen()
    })

    afterAll(() => {
      rmdirSync(root, { recursive: true })
    })

    it("can build", () => {
      system.run("yarn build")
    })
  })

  describe("when there is already a vite build script and some unrecognized ones", () => {
    let buildScripts: string[]

    beforeAll(() => {
      const system = new MockSystem()

      // "build": "rm -rf dist/* && yarn run build:vite && yarn run build:types && yarn run build:bin",
      // "build": "yarn build:vite && rm -rf dist/* && yarn run build:vite && yarn run build:types && yarn run build:bin && yarn build:types && yarn build:bin",

      system.write("package.json", {
        scripts: {
          build: "yarn build:vite && yarn build:foo && yarn build:bar",
        },
      })

      const project = new Project({
        builds: ["lib"],
        globalArgs: { name: "MyLibrary " },
        presetConfigs: ["vite", "dist:lib"],
        system,
      })

      project.confgen()

      const packageJson = JSON.parse(system.read("package.json")) as {
        scripts: Record<string, string>
      }
      buildScripts = packageJson.scripts.build.split(" && ")
    })

    it("should not clobber existing build commands", () => {
      expect(buildScripts).toContain("yarn build:foo")
      expect(buildScripts).toContain("yarn build:bar")
    })

    it("should not add an extra vite script", () => {
      const viteScripts = buildScripts.filter(
        (script) => script === "yarn build:vite"
      )
      expect(viteScripts).toHaveLength(1)
    })
  })
})
