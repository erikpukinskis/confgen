/** A user-facing validation failure. `problems` are reported together. */
export class ConfgenError extends Error {
  readonly problems: readonly string[]

  constructor(problems: readonly string[]) {
    super(problems.join("\n"))
    this.name = "ConfgenError"
    this.problems = problems
  }
}
