import { describe, it, expect } from "vitest"
import { MockSystem } from "~/system"
import { parseAccessor, runCommand } from "./commands"

describe("file command", () => {
  it("doesn't add the same string to an array twice", async () => {
    const system = new MockSystem()

    await runCommand(
      {
        command: "file",
        path: ".eslintrc",
        contents: {
          plugins: ["import"],
        },
      },
      system
    )

    expect(system.json(".eslintrc").plugins).toHaveLength(1)

    await runCommand(
      {
        command: "file",
        path: ".eslintrc",
        contents: {
          plugins: ["import"],
        },
      },
      system
    )

    expect(system.json(".eslintrc").plugins).toHaveLength(1)
  })

  it("parses the query out of an accessor", () => {
    expect(parseAccessor("tasks[label=TypeScript Watch]")).toMatchObject({
      base: "tasks",
      query: "label=TypeScript Watch",
      memberKey: "label",
      targetValue: "TypeScript Watch",
    })
  })

  it("writes JSON content to a deep accessor", async () => {
    const system = new MockSystem()

    await runCommand(
      {
        command: "file",
        path: ".vscode/tasks.json",
        accessor: "tasks[label=TypeScript Watch]",
        contents: {
          type: "typescript",
          label: "TypeScript Watch",
        },
      },
      system
    )

    expect(system.exists(".vscode/tasks.json")).toBe(true)

    expect(system.json(".vscode/tasks.json")).toMatchObject({
      tasks: expect.arrayContaining([
        { type: "typescript", label: "TypeScript Watch" },
      ]),
    })
  })

  it(
    "updates content in a deep accessor",
    async () => {
      const system = new MockSystem()

      await runCommand(
        {
          command: "file",
          path: ".vscode/tasks.json",
          contents: {
            "version": "2.0.0",
            tasks: [
              {
                type: "placeholder",
              },
              {
                label: "TypeScript Watch",
                "type": "command",
                "args": [1, 2, 3],
              },
            ],
          },
        },
        system
      )

      await runCommand(
        {
          command: "file",
          path: ".vscode/tasks.json",
          accessor: "tasks[label=TypeScript Watch]",
          contents: {
            "type": "typescript",
            label: "TypeScript Watch",
          },
          merge: "prefer-preset",
        },
        system
      )

      const result = JSON.parse(system.read(".vscode/tasks.json"))

      expect(result.tasks).toHaveLength(2)

      expect(result).toMatchObject({
        "version": "2.0.0",
        tasks: expect.arrayContaining([
          {
            type: "placeholder",
          },
        ]),
      })

      expect(result).toMatchObject({
        "version": "2.0.0",
        tasks: expect.arrayContaining([
          {
            "type": "typescript",
            label: "TypeScript Watch",
            "args": [1, 2, 3],
          },
        ]),
      })
    },
    60 * 1000
  )

  it("replaces content in a deep accessor", async () => {
    const system = new MockSystem()

    await runCommand(
      {
        command: "file",
        path: ".vscode/tasks.json",
        contents: {
          tasks: [
            {
              label: "TypeScript Watch",
              "args": [1, 2, 3],
            },
          ],
        },
      },
      system
    )

    const initial = JSON.parse(system.read(".vscode/tasks.json"))

    expect(initial).toMatchObject({
      tasks: expect.any(Array),
    })

    const {
      tasks: [initialTask],
    } = initial

    expect(initialTask.args).toEqual([1, 2, 3])

    await runCommand(
      {
        command: "file",
        path: ".vscode/tasks.json",
        accessor: "tasks[label=TypeScript Watch]",
        contents: {
          "type": "typescript",
          label: "TypeScript Watch",
        },
        merge: "replace",
      },
      system
    )

    const result = JSON.parse(system.read(".vscode/tasks.json"))

    expect(result).toMatchObject({
      tasks: expect.any(Array),
    })

    const {
      tasks: [resultingTask],
    } = result

    expect(resultingTask.args).toBeUndefined()
  })
})
