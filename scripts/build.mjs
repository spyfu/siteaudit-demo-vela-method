import { cp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, parse, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_PATH = fileURLToPath(import.meta.url);
export const REPOSITORY_ROOT = resolve(dirname(MODULE_PATH), "..");
export const HEAD_PASTE_MARKER = "<!-- PASTE SITE AUDIT STAGE PIXEL BELOW THIS LINE -->";
export const EDITABLE_START = "<!-- SITEAUDIT-DEMO-INJECT:START -->";
export const EDITABLE_END = "<!-- SITEAUDIT-DEMO-INJECT:END -->";
export const INJECTION_START = "<!-- SITEAUDIT-HEAD:START -->";
export const INJECTION_END = "<!-- SITEAUDIT-HEAD:END -->";
export const FICTIONAL_NOTICE = "This is a fictional SpyFu Site Audit demonstration site. No business, products, credentials, or affiliations shown here are real.";
const CLOUDFLARE_HEADERS = "/*\n  ! X-Robots-Tag\n";
const RUNTIME_REFERENCE_RULES = [
  { label: "Site Audit runtime hostname", pattern: /spyfucdn/i },
  { label: "Site Audit runtime script path", pattern: /\/tag\/v1\.js/i },
  { label: "Site Audit pixel data attribute", pattern: /\bdata-sf\s*=/i },
];
export const PRODUCTION_BRANCHES = Object.freeze([
  "demo-01",
  "demo-02",
  "demo-03",
  "demo-04",
  "demo-05",
]);

function countOccurrences(value, needle) {
  return value.split(needle).length - 1;
}

function assertString(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(
    label + " must be a non-empty string.");
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function assertSafeOutputDirectory(outputDirectory, repositoryRoot, sourceDirectory) {
  const output = resolve(outputDirectory);
  const root = resolve(repositoryRoot);
  const source = resolve(sourceDirectory);
  if (output === parse(output).root || output === root || root.startsWith(output + sep)) {
    throw new Error("Refusing unsafe output directory: " + output);
  }
  if (output === source || source.startsWith(output + sep) || output.startsWith(source + sep)) {
    throw new Error("Output directory overlaps source: " + output);
  }
}

export function assertProductionBranch(env = process.env) {
  const configuredBranch = typeof env.CF_PAGES_BRANCH === "string" ? env.CF_PAGES_BRANCH.trim() : "";
  const branch = configuredBranch || PRODUCTION_BRANCHES[0];
  if (!PRODUCTION_BRANCHES.includes(branch)) throw new Error(
    "Cloudflare may build only demo-01 through demo-05; received " + branch + ".");
  return branch;
}

export async function readFixtureConfig(repositoryRoot = REPOSITORY_ROOT) {
  const config = JSON.parse(await readFile(resolve(repositoryRoot, "fixture.json"), "utf8"));
  if (config.schemaVersion !== 2) throw new Error("fixture.json schemaVersion must be 2.");
  for (const field of ["sampleId", "sourceFixtureId", "repository", "cloudflarePagesProjectBase", "nestedPath"]) {
    assertString(config[field], "fixture.json " + field);
  }
  const expectedRepository = "spyfu/siteaudit-demo-" + config.sampleId;
  const expectedProjectBase = "siteaudit-demo-" + config.sampleId;
  if (config.repository !== expectedRepository) throw new Error("Repository must be " + expectedRepository + ".");
  if (config.cloudflarePagesProjectBase !== expectedProjectBase) throw new Error(
    "Pages project base must be " + expectedProjectBase + ".");
  if (!Array.isArray(config.productionBranches)
      || config.productionBranches.length !== PRODUCTION_BRANCHES.length
      || config.productionBranches.some((branch, index) => branch !== PRODUCTION_BRANCHES[index])) {
    throw new Error("fixture.json productionBranches must be exactly demo-01 through demo-05.");
  }
  return config;
}

export function resolveDeploymentConfig(config, branch) {
  const productionBranch = assertProductionBranch({ CF_PAGES_BRANCH: branch });
  const slotSuffix = productionBranch === "demo-01" ? "" : "-" + productionBranch.slice(-2);
  const cloudflarePagesProject = config.cloudflarePagesProjectBase + slotSuffix;
  return {
    ...config,
    cloudflarePagesProject,
    productionBranch,
    publicUrl: "https://" + cloudflarePagesProject + ".pages.dev/",
    editUrl: "https://github.com/" + config.repository + "/edit/" + productionBranch + "/siteaudit-head.html",
  };
}

export function findRuntimeReference(value) {
  return RUNTIME_REFERENCE_RULES.find((rule) => rule.pattern.test(value))?.label ?? null;
}

export function extractEditableHead(headSource) {
  if (countOccurrences(headSource, "<head>") !== 1 || countOccurrences(headSource, "</head>") !== 1) {
    throw new Error("siteaudit-head.html must contain one recognizable <head> wrapper.");
  }
  if (countOccurrences(headSource, HEAD_PASTE_MARKER) !== 1
      || countOccurrences(headSource, EDITABLE_START) !== 1
      || countOccurrences(headSource, EDITABLE_END) !== 1) {
    throw new Error("siteaudit-head.html must contain each edit marker exactly once.");
  }
  const start = headSource.indexOf(EDITABLE_START) + EDITABLE_START.length;
  const end = headSource.indexOf(EDITABLE_END);
  if (start >= end) throw new Error("Editable head markers are out of order.");
  return headSource.slice(start, end).trim();
}

export function assertCleanHead(headSource) {
  extractEditableHead(headSource);
  const runtimeReference = findRuntimeReference(headSource);
  if (runtimeReference) throw new Error("siteaudit-head.html is not clean: found " + runtimeReference + ".");
  if (/<(?:script|iframe|object|embed)\b/i.test(headSource)) {
    throw new Error("siteaudit-head.html is not clean: executable content is present.");
  }
}

export async function checkCleanBaseline(repositoryRoot = REPOSITORY_ROOT) {
  const headSource = await readFile(resolve(repositoryRoot, "siteaudit-head.html"), "utf8");
  assertCleanHead(headSource);
  const paths = [resolve(repositoryRoot, "fixture.json"), ...await listFiles(resolve(repositoryRoot, "source"))];
  for (const path of paths) {
    const contents = (await readFile(path)).toString("latin1");
    const runtimeReference = findRuntimeReference(contents);
    if (runtimeReference) throw new Error("Clean source contains " + runtimeReference + ": " + relative(repositoryRoot, path));
    if (/(?:https?:\/\/github\.com\/(?!spyfu\/)|@gmail\.com\b)/i.test(contents)) throw new Error("Personal account reference in " + relative(repositoryRoot, path));
  }
  return { checkedFiles: paths.length + 1 };
}

function replaceAllBytes(input, searchValue, replacementValue) {
  const search = Buffer.from(searchValue);
  const replacement = Buffer.from(replacementValue);
  const chunks = [];
  let count = 0;
  let offset = 0;
  let matchIndex = input.indexOf(search, offset);
  while (matchIndex !== -1) {
    chunks.push(input.subarray(offset, matchIndex), replacement);
    count += 1;
    offset = matchIndex + search.length;
    matchIndex = input.indexOf(search, offset);
  }
  if (count === 0) return { contents: input, count };
  chunks.push(input.subarray(offset));
  return { contents: Buffer.concat(chunks), count };
}

function injectFixtureContent(html, sourceLabel, editableHead) {
  const closingHeads = html.match(/<\/head\s*>/gi) ?? [];
  const bodies = html.match(/<body(?:\s[^>]*)?>/gi) ?? [];
  if (closingHeads.length !== 1) throw new Error(sourceLabel + " must contain exactly one closing head tag.");
  if (bodies.length !== 1) throw new Error(sourceLabel + " must contain exactly one body tag.");
  if (html.includes(INJECTION_START) || html.includes(INJECTION_END) || html.includes("data-spyfu-demo-notice")) {
    throw new Error(sourceLabel + " already contains fixture injection markers.");
  }
  const headInjection = INJECTION_START + "\n" + editableHead + "\n" + INJECTION_END + "\n";
  let injected = html.replace(/<\/head\s*>/i, (closing) => headInjection + closing);
  const notice = "<aside data-spyfu-demo-notice=\"true\" style=\"padding:10px 16px;background:#fff4ce;color:#4b3900;border-bottom:1px solid #d6b656;font:600 14px/1.45 system-ui,sans-serif;text-align:center\">" + FICTIONAL_NOTICE + "</aside>";
  injected = injected.replace(/<body(?:\s[^>]*)?>/i, (opening) => opening + "\n" + notice);
  return injected;
}

export async function buildFixture({ repositoryRoot = REPOSITORY_ROOT, outputDirectory = resolve(repositoryRoot, "dist"), env = process.env } = {}) {
  const baseConfig = await readFixtureConfig(repositoryRoot);
  const config = resolveDeploymentConfig(baseConfig, assertProductionBranch(env));
  const sourceDirectory = resolve(repositoryRoot, "source");
  assertSafeOutputDirectory(outputDirectory, repositoryRoot, sourceDirectory);
  const metadata = JSON.parse(await readFile(resolve(sourceDirectory, "siteaudit-owned-canary.json"), "utf8"));
  if (metadata.id !== config.sourceFixtureId) throw new Error("Source metadata identity mismatch.");
  const sourceOrigin = new URL(metadata.url).origin;
  const publicOrigin = new URL(config.publicUrl).origin;
  const headSource = await readFile(resolve(repositoryRoot, "siteaudit-head.html"), "utf8");
  const editableHead = extractEditableHead(headSource);

  await rm(outputDirectory, { recursive: true, force: true });
  await cp(sourceDirectory, outputDirectory, { recursive: true });
  await writeFile(resolve(outputDirectory, "_headers"), CLOUDFLARE_HEADERS, "utf8");

  let htmlPages = 0;
  let rewrittenReferences = 0;
  for (const path of await listFiles(outputDirectory)) {
    const original = await readFile(path);
    const rewritten = replaceAllBytes(original, sourceOrigin, publicOrigin);
    let contents = rewritten.contents;
    rewrittenReferences += rewritten.count;
    if (path.toLowerCase().endsWith(".html")) {
      contents = Buffer.from(injectFixtureContent(contents.toString("utf8"), relative(outputDirectory, path), editableHead));
      htmlPages += 1;
    }
    if (rewritten.count > 0 || path.toLowerCase().endsWith(".html")) await writeFile(path, contents);
  }

  if (htmlPages !== metadata.pageCount) throw new Error("Built " + htmlPages + " pages but metadata declares " + metadata.pageCount + ".");
  if (rewrittenReferences === 0) throw new Error("No source-origin references were rewritten.");
  for (const path of await listFiles(outputDirectory)) {
    const contents = await readFile(path);
    if (contents.includes(Buffer.from(sourceOrigin))) throw new Error("Original canary origin remains in " + relative(outputDirectory, path));
  }
  return { sampleId: config.sampleId, branch: config.productionBranch, cloudflarePagesProject: config.cloudflarePagesProject, publicUrl: config.publicUrl, editUrl: config.editUrl, htmlPages, rewrittenReferences, outputDirectory: resolve(outputDirectory) };
}

async function main() {
  const result = await buildFixture();
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

if (process.argv[1] && resolve(process.argv[1]) === MODULE_PATH) {
  main().catch((error) => { process.stderr.write(error.message + "\n"); process.exitCode = 1; });
}
