[CmdletBinding(SupportsShouldProcess)]
param()

$ErrorActionPreference = 'Stop'
$expectedRepository = 'spyfu/siteaudit-demo-vela-method'
$expectedRemoteHttps = 'https://github.com/spyfu/siteaudit-demo-vela-method.git'
$expectedRemoteSsh = 'git@github.com:spyfu/siteaudit-demo-vela-method.git'

$repositoryRoot = (git rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($repositoryRoot)) {
    throw 'Run this script from a clone of the fixture repository.'
}

Set-Location -LiteralPath $repositoryRoot
$origin = (git remote get-url origin).Trim()
if ($origin -ne $expectedRemoteHttps -and $origin -ne $expectedRemoteSsh) {
    throw "Origin must be $expectedRepository; found $origin"
}

git diff --quiet
if ($LASTEXITCODE -ne 0) { throw 'The working tree has unstaged changes.' }
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { throw 'The working tree has staged changes.' }

git fetch origin main demo-01
if ($LASTEXITCODE -ne 0) { throw 'Could not fetch main and demo-01.' }

$mainTree = (git rev-parse 'origin/main^{tree}').Trim()
$demoHead = (git rev-parse 'origin/demo-01').Trim()
$demoTree = (git rev-parse 'origin/demo-01^{tree}').Trim()
if ($mainTree -eq $demoTree) {
    Write-Output "demo-01 is already clean at $demoHead"
    exit 0
}

$message = 'Reset demo-01 to clean main baseline'
$resetCommit = ($message | git commit-tree $mainTree -p $demoHead).Trim()
if ($LASTEXITCODE -ne 0 -or $resetCommit -notmatch '^[0-9a-f]{40}$') {
    throw 'Could not create the normal reset commit.'
}

if ($PSCmdlet.ShouldProcess("$expectedRepository demo-01", "Push clean reset commit $resetCommit")) {
    git push origin "${resetCommit}:refs/heads/demo-01"
    if ($LASTEXITCODE -ne 0) { throw 'The reset push failed.' }
    Write-Output "Pushed clean reset commit $resetCommit"
}
