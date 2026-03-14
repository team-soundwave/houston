$ErrorActionPreference = "Stop"

param(
  [ValidateSet("ground", "all", "edge")]
  [string]$Mode = "ground"
)

$RepoUrl = if ($env:HOUSTON_REPO_URL) { $env:HOUSTON_REPO_URL } else { "https://github.com/team-soundwave/houston.git" }
$TargetDir = if ($env:HOUSTON_TARGET_DIR) { $env:HOUSTON_TARGET_DIR } else { Join-Path $HOME "houston" }

if (Test-Path ".\scripts\dev_up.py") {
  $RootDir = (Get-Location).Path
} else {
  $RootDir = $TargetDir
  if (Test-Path (Join-Path $RootDir ".git")) {
    git -C $RootDir pull --ff-only
  } elseif (Test-Path $RootDir) {
    throw "Target directory exists but is not a git checkout: $RootDir"
  } else {
    git clone $RepoUrl $RootDir
  }
}

Set-Location $RootDir
py scripts/dev_up.py $Mode
