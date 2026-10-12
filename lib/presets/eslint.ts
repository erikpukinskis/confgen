import type {
  Contribution,
  JsonValue,
  ProduceContributions,
  StructuredAddress,
} from "../contributions.js"
import type { Selection } from "../selection.js"

/** ESLint owns lint configuration for TypeScript sources. */
export const contributions: ProduceContributions = (selection) => [
  dependency("eslint", "8.57.1"),
  dependency("@typescript-eslint/eslint-plugin", "8.70.0"),
  dependency("@typescript-eslint/parser", "8.70.0"),
  dependency("eslint-plugin-import", "2.32.0"),
  dependency("eslint-import-resolver-typescript", "3.7.0"),
  script("check:lint", "eslint --no-error-on-unmatched-pattern ."),
  script("fix:lint", "eslint --no-error-on-unmatched-pattern . --fix"),
  setting("eslint:root", ["root"], true),
  setting("eslint:parser", ["parser"], "@typescript-eslint/parser"),
  setting("eslint:plugins", ["plugins"], ["@typescript-eslint", "import"]),
  setting(
    "eslint:extends",
    ["extends"],
    [
      "eslint:recommended",
      "plugin:@typescript-eslint/eslint-recommended",
      "plugin:@typescript-eslint/recommended",
      "plugin:@typescript-eslint/recommended-requiring-type-checking",
    ]
  ),
  setting("eslint:ignore", ["ignorePatterns"], ignorePatterns(selection)),
  setting("eslint:parser-options", ["parserOptions"], {
    warnOnUnsupportedTypeScriptVersion: false,
    project: typecheckProjects(selection),
  }),
  setting("eslint:settings", ["settings"], {
    "import/external-module-folders": [".yarn", "node_modules"],
    "import/resolver": {
      typescript: true,
      node: true,
    },
  }),
  setting("eslint:rules", ["rules"], rules, "merge"),
]

function ignorePatterns(selection: Selection): string[] {
  const patterns = [
    "dist",
    ".yarn",
    ".pnp.cjs",
    ".pnp.loader.mjs",
    "coverage",
    "vite.*.config.ts",
  ]
  if (selection.presets.includes("graphql")) patterns.push("gql/**/_generated")
  return patterns
}

function typecheckProjects(selection: Selection): string[] {
  const projects = ["./tsconfig.json"]
  if (selection.runtimes.includes("client")) {
    projects.push("./tsconfig.client.json")
  }
  return projects
}

const rules = {
  "@typescript-eslint/no-explicit-any": "error",
  "@typescript-eslint/no-unused-vars": [
    "error",
    {
      args: "after-used",
      varsIgnorePattern: "^_",
    },
  ],
  "@typescript-eslint/consistent-type-imports": [
    "error",
    {
      prefer: "type-imports",
    },
  ],
  "@typescript-eslint/restrict-template-expressions": [
    "error",
    {
      allowNullish: true,
    },
  ],
  "@typescript-eslint/no-floating-promises": "error",
  "semi": ["error", "never"],
  "eol-last": ["error", "always"],
  "quote-props": ["error", "consistent-as-needed"],
  "no-unused-vars": "off",
  "import/order": [
    "error",
    {
      "alphabetize": {
        order: "asc",
        caseInsensitive: true,
      },
      "newlines-between": "never",
    },
  ],
  "import/first": "error",
  "import/newline-after-import": "error",
  "import/no-duplicates": "error",
} satisfies JsonValue

function setting(
  id: string,
  address: StructuredAddress,
  value: JsonValue,
  update: "merge" | "replace" = "replace"
): Contribution {
  return {
    id,
    source: "preset:eslint",
    kind: "structured",
    path: ".eslintrc.json",
    format: "json",
    address,
    value,
    update,
  }
}

function dependency(name: string, range: string): Contribution {
  return {
    id: `eslint:dependency:${name}`,
    source: "preset:eslint",
    kind: "dependency",
    manifest: "package.json",
    section: "devDependencies",
    package: name,
    range,
  }
}

function script(name: string, command: string): Contribution {
  return {
    id: `eslint:script:${name}`,
    source: "preset:eslint",
    kind: "package-script",
    manifest: "package.json",
    name,
    command,
  }
}
