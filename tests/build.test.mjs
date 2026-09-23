import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, cp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import test from "node:test";
import {
  FICTIONAL_NOTICE,
  PRODUCTION_BRANCHES,
  REPOSITORY_ROOT,
  assertCleanHead,
  assertProductionBranch,
  buildFixture,
  checkCleanBaseline,
  readFixtureConfig,
  resolveDeploymentConfig,
} from "../scripts/build.mjs";
import { readHead, renderSharedHead, PAGE_HEAD_PLACEHOLDER } from "../scripts/shared-head.mjs";

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

test("configuration pins one public SpyFu repository to exactly five demo branches", async () => {
  const config = await readFixtureConfig();
  assert.equal(config.repository, "spyfu/siteaudit-demo-" + config.sampleId);
  assert.equal(config.cloudflarePagesProjectBase, "siteaudit-demo-" + config.sampleId);
  assert.deepEqual(config.productionBranches, PRODUCTION_BRANCHES);
});

test("Cloudflare branch guard defaults locally and accepts exactly demo-01 through demo-05", () => {
  assert.equal(assertProductionBranch({}), "demo-01");
  for (const branch of PRODUCTION_BRANCHES) assert.equal(assertProductionBranch({ CF_PAGES_BRANCH: branch }), branch);
  for (const branch of ["main", "pull-request", "demo-00", "demo-06", "demo-1", "DEMO-01"]) {
    assert.throws(() => assertProductionBranch({ CF_PAGES_BRANCH: branch }), /only demo-01 through demo-05/);
  }
});

test("every demo branch maps to its own Pages project, public URL, and edit URL", async () => {
  const config = await readFixtureConfig();
  for (const branch of PRODUCTION_BRANCHES) {
    const suffix = branch === "demo-01" ? "" : "-" + branch.slice(-2);
    const expectedProject = config.cloudflarePagesProjectBase + suffix;
    const deployment = resolveDeploymentConfig(config, branch);
    assert.equal(deployment.productionBranch, branch);
    assert.equal(deployment.cloudflarePagesProject, expectedProject);
    assert.equal(deployment.publicUrl, "https://" + expectedProject + ".pages.dev/");
    assert.equal(deployment.editUrl, "https://github.com/" + config.repository + "/edit/" + branch + "/siteaudit-head.html");
  }
});

test("editable file is the real shared head, with page-specific metadata supplied separately", async () => {
  const head = await readFile(resolve(REPOSITORY_ROOT, "siteaudit-head.html"), "utf8");
  assertCleanHead(head);
  assert.equal(count(head, "<head>"), 1);
  assert.equal(count(head, "</head>"), 1);
  assert.equal(count(head, PAGE_HEAD_PLACEHOLDER), 1);
  assert.doesNotMatch(head, /SITEAUDIT-DEMO-INJECT|PASTE SITE AUDIT STAGE PIXEL/);
  assert.match(head, /<meta charset="utf-8">/);
  assert.match(head, /<meta name="viewport"/);
  assert.match(head, /<link rel="stylesheet"/);
});

test("clean source contains no prior pixel or personal-account reference", async () => {
  const result = await checkCleanBaseline();
  assert.ok(result.checkedFiles > 1);
});

test("reset script accepts only the five slot branches and pushes a normal descendant commit", async () => {
  const resetScript = await readFile(resolve(REPOSITORY_ROOT, "scripts/reset-demo-slot.ps1"), "utf8");
  assert.match(resetScript, /ValidateSet\('demo-01', 'demo-02', 'demo-03', 'demo-04', 'demo-05'\)/);
  assert.match(resetScript, /git commit-tree \$mainTree -p \$slotHead/);
  assert.match(resetScript, /git push origin "\$\{resetCommit\}:refs\/heads\/\$Branch"/);
  assert.doesNotMatch(resetScript, /git push[^\r\n]*--force/i);
  assert.doesNotMatch(resetScript, /git push[^\r\n]*\s-f(?:\s|$)/im);
});

for (const branch of PRODUCTION_BRANCHES) {
  test("build for " + branch + " is bounded and rewrites every page to its slot URL", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "siteaudit-public-fixture-"));
    try {
      const env = { CF_PAGES_BRANCH: branch };
      const outputDirectory = resolve(tempRoot, "dist");
      const result = await buildFixture({ outputDirectory, env });
      const files = await listFiles(outputDirectory);
      const htmlFiles = files.filter((path) => path.endsWith(".html"));
      assert.equal(result.branch, branch);
      const suffix = branch === "demo-01" ? "" : "-" + branch.slice(-2);
      assert.equal(result.cloudflarePagesProject, "siteaudit-demo-" + result.sampleId + suffix);
      assert.equal(result.publicUrl, "https://" + result.cloudflarePagesProject + ".pages.dev/");
      assert.equal(result.editUrl, "https://github.com/spyfu/siteaudit-demo-" + result.sampleId + "/edit/" + branch + "/siteaudit-head.html");
      assert.ok(result.htmlPages >= 5 && result.htmlPages <= 8);
      assert.equal(htmlFiles.length, result.htmlPages);
      assert.ok(htmlFiles.some((path) => relative(outputDirectory, path) === "index.html"));
      assert.ok(htmlFiles.some((path) => relative(outputDirectory, path) !== "index.html"));
      for (const path of htmlFiles) {
        const html = await readFile(path, "utf8");
        const { head } = readHead(html);
        assert.equal(head.childNodes.filter(node => node.tagName === "title").length, 1);
        assert.equal(head.childNodes.filter(node => node.tagName === "meta" && node.attrs.some(attr => attr.name === "charset")).length, 1);
        assert.doesNotMatch(html, /\{\{ page\.head \}\}|SITEAUDIT:SHARED_HEAD/);
        assert.equal(count(html, FICTIONAL_NOTICE), 1, relative(outputDirectory, path));
        assert.ok(html.includes(new URL(result.publicUrl).origin), relative(outputDirectory, path));
      }
      const sitemap = await readFile(resolve(outputDirectory, "sitemap.xml"), "utf8");
      const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1]));
      assert.equal(locations.length, result.htmlPages);
      assert.ok(locations.every((url) => url.origin === new URL(result.publicUrl).origin));
      assert.equal(new Set(locations.map((url) => url.href)).size, locations.length);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
}

test("a snippet anywhere in the shared head reaches every page exactly once", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "siteaudit-head-positions-"));
  try {
    for (const name of ["source", "fixture.json", "page-heads.json"]) {
      await cp(resolve(REPOSITORY_ROOT, name), resolve(tempRoot, name), { recursive: true });
    }
    const clean = await readFile(resolve(REPOSITORY_ROOT, "siteaudit-head.html"), "utf8");
    const pixel = '<script src="https://spyfucdn.com/tag/v1.js" data-sf="placement-test" async></script>';
    const variants = [
      clean.replace('<head>', '<head>\n' + pixel),
      clean.replace('<meta charset', pixel + '\n<meta charset'),
      clean.replace(PAGE_HEAD_PLACEHOLDER, pixel + '\n' + PAGE_HEAD_PLACEHOLDER),
      clean.replace('<style>', pixel + '\n<style>'),
      clean.replace('</head>', pixel + '\n</head>'),
      clean.replace(/\s*<!--[\s\S]*?-->/g, '').replace('</head>', pixel + '\n</head>'),
      clean.replace('</head>', pixel + '\n<!-- SITEAUDIT-DEMO-INJECT:START --><!-- SITEAUDIT-DEMO-INJECT:END -->\n</head>'),
    ];
    for (const [index, template] of variants.entries()) {
      await writeFile(resolve(tempRoot, 'siteaudit-head.html'), template);
      const outputDirectory = resolve(tempRoot, 'dist-' + index);
      await buildFixture({ repositoryRoot: tempRoot, outputDirectory, env: { CF_PAGES_BRANCH: 'demo-01' } });
      for (const path of (await listFiles(outputDirectory)).filter(path => path.endsWith('.html'))) {
        const html = await readFile(path, 'utf8');
        assert.equal(count(html, pixel), 1, 'position ' + index + ': ' + relative(outputDirectory, path));
        const { head } = readHead(html);
        assert.equal(head.childNodes.filter(node => node.tagName === 'script' && node.attrs.some(attr => attr.name === 'data-sf' && attr.value === 'placement-test')).length, 1);
      }
      await assert.rejects(checkCleanBaseline(tempRoot), /not clean/);
    }
    // Restoring just this file removes the pixel from every page again.
    await writeFile(resolve(tempRoot, 'siteaudit-head.html'), clean);
    await checkCleanBaseline(tempRoot);
    const outputDirectory = resolve(tempRoot, 'reset');
    await buildFixture({ repositoryRoot: tempRoot, outputDirectory, env: {} });
    for (const path of (await listFiles(outputDirectory)).filter(path => path.endsWith('.html'))) {
      assert.doesNotMatch(await readFile(path, 'utf8'), /placement-test|spyfucdn/);
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("all real head edits render, and JavaScript strings are not treated as HTML wrappers", () => {
  const script = '<script>const text = "</head><body>$&";</script>';
  const template = '<HEAD data-test="shared"><meta name="theme-color" content="blue">' + script + PAGE_HEAD_PLACEHOLDER + '</HEAD>';
  const rendered = renderSharedHead(template, '<title>Page title</title>');
  assert.equal(rendered, template.replace(PAGE_HEAD_PLACEHOLDER, '<title>Page title</title>'));
  assert.equal(readHead(rendered).head.childNodes.filter(node => node.tagName === 'script').length, 1);
});

test("malformed or out-of-head content fails instead of being silently dropped", () => {
  const good = '<head>' + PAGE_HEAD_PLACEHOLDER + '</head>';
  for (const bad of [good + '<script>outside()</script>', '<script>outside()</script>' + good, good + '<head></head>', good.replace('</head>', ''), good.replace(PAGE_HEAD_PLACEHOLDER, ''), good.replace(PAGE_HEAD_PLACEHOLDER, PAGE_HEAD_PLACEHOLDER.repeat(2)), good.replace('</head>', '<div>body content</div></head>')]) {
    assert.throws(() => renderSharedHead(bad, '<title>Test</title>'));
  }
  assert.throws(() => renderSharedHead(good, undefined), /Missing/);
});
