# siteaudit-demo-vela-method

Public, intentionally fictional Site Audit demonstration fixture owned by the SpyFu organization.

This repository has exactly one deployable slot:

- clean reset source: `main`
- Cloudflare production branch: `demo-01`
- Pages project: `siteaudit-demo-vela-method`
- public site: https://siteaudit-demo-vela-method.pages.dev/
- header editor: https://github.com/spyfu/siteaudit-demo-vela-method/edit/demo-01/siteaudit-head.html

## Demoer workflow

1. Open the assigned public site in Site Audit and create or select its project.
2. In **Publish Setup**, copy that project's Site Audit stage pixel.
3. Open the header editor above. Confirm GitHub is editing `demo-01`, not `main`.
4. Paste the pixel below `PASTE SITE AUDIT STAGE PIXEL BELOW THIS LINE` inside the realistic `<head>` context.
5. Commit directly to `demo-01` with a short demo-specific message.
6. Wait for the Cloudflare deployment check to finish, then select **Check installation** in Site Audit.

Cloudflare is configured to deploy only `demo-01`. Public pull requests and other branches are not deployment inputs.

## Reset without rewriting history

An operator releases the slot only after restoring `demo-01` to the exact tree from `main` with a normal descendant commit:

```powershell
git clone https://github.com/spyfu/siteaudit-demo-vela-method.git
Set-Location siteaudit-demo-vela-method
./scripts/reset-demo-01.ps1
```

The reset script creates a new commit whose parent is the current `demo-01` head and whose tree is the clean `main` tree. It never force-pushes. Wait for Cloudflare to redeploy, verify the pixel is gone on the homepage and a nested page, then mark the console slot clean with the new full commit SHA.

## Local verification

```powershell
npm test
npm run check:clean
npm run build
```

The generated site contains a bounded sitemap and between five and eight HTML pages. Do not add credentials, real customer data, private publishing tokens, GitHub Actions, or deployment scripts that require secrets.
