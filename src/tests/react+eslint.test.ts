import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { MockProject, type Project } from '../project'

describe("the eslint preset", () => {
  let project: Project
  beforeEach(() => {
    project = new MockProject({
      presets: ["eslint"]
    })
    project.confgen()
  })

  it("should not have the eslint-plugin-react package", () => {
    expect(project.getFileContents('package.json')).not.toContain('eslint-plugin-react')
  })

  describe("plus the react preset", () => {
    beforeEach(() => {
      project.addPreset("react")
      project.confgen()
    })

    it("should have the eslint-plugin-react package", () => {
      expect(project.getFileContents('package.json')).toContain('eslint-plugin-react')
    })
  })
})