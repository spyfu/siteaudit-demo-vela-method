# siteaudit-demo-vela-method

Public, intentionally fictional Site Audit demonstration fixture owned by the SpyFu organization.

The clean reset source is `main`. Five mutable branches are reserved so the pool can expand without redesigning this repository. While the Cloudflare account limit is in effect, only `demo-01` and `demo-02` are operational and claimable:

| Branch | State | Cloudflare Pages project | Public site | Header editor |
| --- | --- | --- | --- | --- |
| `demo-01` | Operational | `siteaudit-demo-vela-method` | https://siteaudit-demo-vela-method.pages.dev/ | https://github.com/spyfu/siteaudit-demo-vela-method/edit/demo-01/siteaudit-head.html |
| `demo-02` | Operational | `siteaudit-demo-vela-method-02` | https://siteaudit-demo-vela-method-02.pages.dev/ | https://github.com/spyfu/siteaudit-demo-vela-method/edit/demo-02/siteaudit-head.html |

`demo-03` through `demo-05` are reserved and quarantined. A branch by itself is not a deployable slot. Do not use or advertise one of those branches until it has its own Pages project and root `pages.dev` URL, its production deployment has been verified, and Fixture Console marks the slot clean. Fixture Console is the authority for current availability.

Each Pages project must use its matching branch as the production branch and have preview branch deployments disabled. A commit then deploys only the assigned slot; public pull requests and other branches are not deployment inputs.

## Demoer workflow

1. Open the public site assigned by Fixture Console in Site Audit and create or select its project.
2. In **Publish Setup**, copy that project's Site Audit snippet.
3. Open the assigned header editor. Confirm GitHub is editing the exact assigned `demo-NN` branch, not `main`.
4. Paste the snippet anywhere inside `<head>` in `siteaudit-head.html`. Placing it near the opening `<head>` tag works; no comment markers are required.
5. Commit directly to the assigned branch with a short demo-specific message.
6. Wait for that slot's Cloudflare deployment check to finish, then select **Check installation** in Site Audit.

## The actual shared head

`siteaudit-head.html` is the head template used by every generated page. Its
tags, styles, and scripts are rendered in their written order. Edits outside
the head fail the build instead of being silently ignored.

The `{{ page.head }}` template expression inserts each page's title,
description, canonical URL, social tags, and structured data from
`page-heads.json`. Keep this expression so pages retain their own metadata.
Page bodies in `source/` reference this template once; they do not contain a
second competing head. The build still rewrites URLs to the assigned slot.

To reset an installation manually, remove the snippet from this shared file,
commit, and verify both the homepage and a nested page after deployment.

## Reset without rewriting history

An operator releases a slot only after restoring its exact branch to the tree from `main` with a normal descendant commit:

```powershell
git clone https://github.com/spyfu/siteaudit-demo-vela-method.git
Set-Location siteaudit-demo-vela-method
./scripts/reset-demo-slot.ps1 -Branch demo-01
```

The reset script accepts exactly `demo-01` through `demo-05`, but operators should reset and release only a slot that Fixture Console currently exposes as operational. It creates a new commit whose parent is the current slot head and whose tree is the clean `main` tree. It never force-pushes. Wait for the matching Pages project to redeploy, verify the pixel is gone on the homepage and a nested page, then mark the console slot clean with the new full commit SHA.

## Local verification

```powershell
npm test
npm run check:clean
npm run build
```

A local build defaults to `demo-01`. Set `CF_PAGES_BRANCH` to `demo-02`, or to a later branch only after that slot has been separately activated, to verify its derived URL.

The generated site contains a bounded sitemap and between five and eight HTML pages. Do not add credentials, real customer data, private publishing tokens, GitHub Actions, or deployment scripts that require secrets.
