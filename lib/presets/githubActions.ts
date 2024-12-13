import kebabCase from "lodash/kebabCase"
import type { CommandGenerator } from "~/commands"
import type { JsonObject } from "~/helpers/json"

export const generator: CommandGenerator = () => []

type GithubJob = {
  "runs-on": string
  steps: JsonObject[]
}

type GithubWorkflow = {
  name?: string
  on?: string | Record<string, Record<string, string[]>>
  concurrency?: {
    "group": string
    "cancel-in-progress": boolean
  }
  jobs: Record<string, GithubJob>
}

export type GithubStep = {
  name?: string
  id?: string
  uses?: string
  run?: string
  with?: {
    path?: string
  }
}

export type GithubJobConfig = {
  jobName: string
  steps: GithubStep[]
  jobOptions?: {
    environment?: {
      name: string
      url: string
    }
  }
}

type GetGithubWorkflowOptions = {
  needsPackages: boolean
  workflowName: string
  jobs: GithubJobConfig[]
  workflowOptions?: {
    permissions?: Record<string, "read" | "write">
  }
  includeBranch?: string
  excludeBranch?: string
}

export const getGithubWorkflow = ({
  needsPackages,
  workflowName,
  workflowOptions,
  jobs: jobOptions,
  includeBranch,
  excludeBranch,
}: GetGithubWorkflowOptions): JsonObject => {
  const githubJobs = jobOptions.reduce(
    (jobs, { jobName, jobOptions, steps }) => {
      const job: GithubJob = {
        "runs-on": "ubuntu-latest",
        steps,
        ...jobOptions,
      }

      return {
        ...jobs,
        [jobName]: job,
      }
    },
    {} as Record<string, GithubJob>
  )

  const workflow: GithubWorkflow = {
    name: workflowName,
    ...workflowOptions,
    jobs: githubJobs,

    concurrency: {
      "group": kebabCase(`${jobOptions[0].jobName} ${workflowName}`),
      "cancel-in-progress": true,
    },
  }

  if (includeBranch) {
    workflow.on = { push: { branches: ["main"] } }
  } else if (excludeBranch) {
    workflow.on = { push: { "branches-ignore": ["main"] } }
  } else {
    workflow.on = "push"
  }

  jobOptions.forEach(({ jobName }) => {
    if (needsPackages) {
      workflow.jobs[jobName].steps.unshift(
        {
          name: "Set up Yarn cache",
          uses: "actions/setup-node@v3",
          with: {
            "node-version": "18",
            "cache": "yarn",
          },
        },
        {
          run: "yarn install --frozen-lockfile",
        }
      )
    }

    workflow.jobs[jobName].steps.unshift({
      name: "Check out",
      uses: "actions/checkout@v3",
    })
  })

  return workflow
}
