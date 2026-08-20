<#
.SYNOPSIS
  dotfiles installer (Windows native)

.DESCRIPTION
  .claude/commands, .claude/skills, .claude/CLAUDE.md を
  $HOME\.claude 以下へシンボリックリンクします。
  既存の実体ディレクトリ/ファイルがある場合は上書きせずタイムスタンプ付きで退避します。

.NOTES
  シンボリックリンクの作成には「開発者モード」を有効にしているか、
  管理者権限で PowerShell を実行している必要があります。
  開発者モード: 設定 > プライバシーとセキュリティ > 開発者向け > 開発者モード
#>

$ErrorActionPreference = "Stop"

$DotfilesDir = $PSScriptRoot
$ClaudeDir = Join-Path $HOME ".claude"
$Timestamp = Get-Date -Format "yyyyMMddHHmmss"

function Link-Item {
    param(
        [string]$Src,
        [string]$Dest
    )

    $destParent = Split-Path -Parent $Dest
    if (-not (Test-Path $destParent)) {
        New-Item -ItemType Directory -Path $destParent -Force | Out-Null
    }

    $existing = Get-Item -Path $Dest -Force -ErrorAction SilentlyContinue

    if ($existing -and $existing.LinkType -eq "SymbolicLink") {
        if ($existing.Target -eq $Src) {
            Write-Host "skip (already linked): $Dest"
            return
        }
        Write-Host "remove stale symlink: $Dest"
        Remove-Item -Path $Dest -Force
        $existing = $null
    }

    if ($existing) {
        $backup = "$Dest.bak.$Timestamp"
        Write-Host "backup existing $Dest -> $backup"
        Move-Item -Path $Dest -Destination $backup
    }

    New-Item -ItemType SymbolicLink -Path $Dest -Target $Src | Out-Null
    Write-Host "linked: $Dest -> $Src"
}

try {
    Link-Item -Src (Join-Path $DotfilesDir ".claude\commands") -Dest (Join-Path $ClaudeDir "commands")
    Link-Item -Src (Join-Path $DotfilesDir ".claude\skills") -Dest (Join-Path $ClaudeDir "skills")
    Link-Item -Src (Join-Path $DotfilesDir ".claude\CLAUDE.md") -Dest (Join-Path $ClaudeDir "CLAUDE.md")
    Write-Host "done."
}
catch {
    Write-Error "symlink作成に失敗しました。開発者モードを有効にするか、管理者権限でPowerShellを実行してください。`n$_"
    exit 1
}
