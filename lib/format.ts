import prettier from "prettier"
import parserTypescript from "prettier/parser-typescript"

export const formatTypescript = async (source: string) => {
  const config = await prettier.resolveConfig(process.cwd())
  return prettier.format(source, {
    parser: "typescript",
    plugins: [parserTypescript],
    ...config,
  })
}

export const formatJson = async (input: string | Record<string, unknown>) => {
  const config = await prettier.resolveConfig(process.cwd())
  const source =
    typeof input === "object" ? JSON.stringify(input, null, 2) : input
  return prettier.format(source, {
    parser: "json",
    ...config,
  })
}

export const formatHtml = async (source: string) => {
  const config = await prettier.resolveConfig(process.cwd())
  return prettier.format(source, {
    parser: "html",
    ...config,
  })
}
