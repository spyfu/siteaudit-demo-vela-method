[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)]
    [ValidateSet('demo-01', 'demo-02', 'demo-03', 'demo-04', 'demo-05')]
    [string]$Branch
)

$ErrorActionPreference = 'Stop'
if ($Branch -cnotmatch '^demo-0[1-5]$') {
    throw 'Branch must be exactly demo-01 through demo-05.'
}

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

git fetch origin main $Branch
if ($LASTEXITCODE -ne 0) { throw "Could not fetch main and $Branch." }

$mainTree = (git rev-parse 'origin/main^{tree}').Trim()
$slotHead = (git rev-parse "origin/$Branch").Trim()
$slotTree = (git rev-parse "origin/$Branch^{tree}").Trim()
if ($mainTree -eq $slotTree) {
    Write-Output "$Branch is already clean at $slotHead"
    exit 0
}

$message = "Reset $Branch to clean main baseline"
$resetCommit = ($message | git commit-tree $mainTree -p $slotHead).Trim()
if ($LASTEXITCODE -ne 0 -or $resetCommit -notmatch '^[0-9a-f]{40}$') {
    throw 'Could not create the normal reset commit.'
}

if ($PSCmdlet.ShouldProcess("$expectedRepository $Branch", "Push clean reset commit $resetCommit")) {
    git push origin "${resetCommit}:refs/heads/$Branch"
    if ($LASTEXITCODE -ne 0) { throw 'The reset push failed.' }
    Write-Output "Pushed clean reset commit $resetCommit"
}
