import type { CommandGenerator } from "~/commands"

export const generator: CommandGenerator = () => []

type GithubJob = {
  "runs-on": string
  steps: unknown[]
}

type GithubWorkflow = {
  name?: string
  on?: string
  jobs: Record<string, GithubJob>
}

type GithubStep = Record<string, unknown>

type GithubJobConfig = {
  jobName: string
  steps: GithubStep[]
  jobOptions?: Record<string, unknown>
}

type GetGithubWorkflowOptions = {
  needsPackages: boolean
  workflowName: string
  jobs: GithubJobConfig[]
  workflowOptions?: Record<string, unknown>
}

export const getGithubWorkflow = ({
  needsPackages,
  workflowName,
  workflowOptions,
  jobs: jobOptions,
}: GetGithubWorkflowOptions) => {
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
    on: "push",
    ...workflowOptions,
    jobs: githubJobs,
  }

  jobOptions.forEach(({ jobName }) => {
    if (needsPackages) {
      workflow.jobs[jobName].steps.unshift(
        {
          name: "Set up Yarn cache",
          uses: "actions/setup-node@v3",
          with: {
            "node-version": "16",
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
