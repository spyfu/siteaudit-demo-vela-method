import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import test from "node:test";
import {
  EDITABLE_END,
  EDITABLE_START,
  FICTIONAL_NOTICE,
  HEAD_PASTE_MARKER,
  INJECTION_END,
  INJECTION_START,
  REPOSITORY_ROOT,
  assertCleanHead,
  assertProductionBranch,
  buildFixture,
  checkCleanBaseline,
  readFixtureConfig,
} from "../scripts/build.mjs";

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

const count = (value, needle) => value.split(needle).length - 1;

test("configuration pins one public SpyFu repository to demo-01 and one Pages project", async () => {
  const config = await readFixtureConfig();
  assert.equal(config.repository, "spyfu/siteaudit-demo-" + config.sampleId);
  assert.equal(config.cloudflarePagesProject, "siteaudit-demo-" + config.sampleId);
  assert.equal(config.productionBranch, "demo-01");
  assert.equal(config.publicUrl, "https://" + config.cloudflarePagesProject + ".pages.dev/");
  assert.equal(config.editUrl, "https://github.com/" + config.repository + "/edit/demo-01/siteaudit-head.html");
});

test("Cloudflare branch guard rejects every branch except demo-01", () => {
  assert.equal(assertProductionBranch({ CF_PAGES_BRANCH: "demo-01" }), "demo-01");
  assert.throws(() => assertProductionBranch({ CF_PAGES_BRANCH: "main" }), /only demo-01/);
  assert.throws(() => assertProductionBranch({ CF_PAGES_BRANCH: "pull-request" }), /only demo-01/);
});

test("editable header has realistic head context and a clean pixel region", async () => {
  const head = await readFile(resolve(REPOSITORY_ROOT, "siteaudit-head.html"), "utf8");
  assertCleanHead(head);
  assert.equal(count(head, "<head>"), 1);
  assert.equal(count(head, "</head>"), 1);
  assert.equal(count(head, EDITABLE_START), 1);
  assert.equal(count(head, EDITABLE_END), 1);
  assert.equal(count(head, HEAD_PASTE_MARKER), 1);
  assert.match(head, /<meta charset="utf-8">/);
  assert.match(head, /<meta name="viewport"/);
  assert.match(head, /<link rel="stylesheet"/);
});

test("clean source contains no prior pixel or personal-account reference", async () => {
  const result = await checkCleanBaseline();
  assert.ok(result.checkedFiles > 1);
});

test("reset script pushes the normal commit with an unambiguous refspec", async () => {
  const resetScript = await readFile(resolve(REPOSITORY_ROOT, "scripts/reset-demo-01.ps1"), "utf8");
  assert.match(resetScript, /git push origin "\$\{resetCommit\}:refs\/heads\/demo-01"/);
  assert.doesNotMatch(resetScript, /git push origin "\$resetCommit:refs\//);
});

test("build is bounded and injects the editable region on the homepage and every nested page", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "siteaudit-public-fixture-"));
  try {
    const config = await readFixtureConfig();
    const outputDirectory = resolve(tempRoot, "dist");
    const result = await buildFixture({ outputDirectory });
    const files = await listFiles(outputDirectory);
    const htmlFiles = files.filter((path) => path.endsWith(".html"));
    assert.ok(result.htmlPages >= 5 && result.htmlPages <= 8);
    assert.equal(htmlFiles.length, result.htmlPages);
    assert.ok(htmlFiles.some((path) => relative(outputDirectory, path) === "index.html"));
    assert.ok(htmlFiles.some((path) => relative(outputDirectory, path) !== "index.html"));
    for (const path of htmlFiles) {
      const html = await readFile(path, "utf8");
      assert.equal(count(html, INJECTION_START), 1, relative(outputDirectory, path));
      assert.equal(count(html, INJECTION_END), 1, relative(outputDirectory, path));
      assert.equal(count(html, HEAD_PASTE_MARKER), 1, relative(outputDirectory, path));
      assert.equal(count(html, FICTIONAL_NOTICE), 1, relative(outputDirectory, path));
      assert.ok(html.includes(new URL(config.publicUrl).origin), relative(outputDirectory, path));
    }
    const sitemap = await readFile(resolve(outputDirectory, "sitemap.xml"), "utf8");
    const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1]));
    assert.equal(locations.length, result.htmlPages);
    assert.ok(locations.every((url) => url.origin === new URL(config.publicUrl).origin));
    assert.equal(new Set(locations.map((url) => url.href)).size, locations.length);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
