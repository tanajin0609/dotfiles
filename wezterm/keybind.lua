local wezterm = require 'wezterm'
local act = wezterm.action

local M = {}

M.leader = { key = 'a', mods = 'CTRL', timeout_milliseconds = 1000 }

-- 既定ドメインが WSL のため、PowerShell 系は明示的にローカルドメインで起動する
-- （domain を指定しないと WSL 内で powershell.exe を起動しようとして即終了する）
local LOCAL = { DomainName = 'local' }
-- Windows ユーザープロファイル（C:\Users\<user>）を環境変数から解決
local PS_CWD = os.getenv('USERPROFILE')

-- WSL は専用ドメインで開く（既定ドメインが WSL のため args = wsl.exe だと
-- WSL 内でさらに wsl.exe を起動しようとして即終了する。ドメイン指定で回避）
-- 起動ディレクトリは指定せず WSL ディストロの既定ホームに任せる
local WSL = { DomainName = 'WSL:Ubuntu-24.04' }

-- Git Bash（ログインシェルとして起動）
local GIT_BASH = { 'C:\\Program Files\\Git\\bin\\bash.exe', '-i', '-l' }

M.keys = {
  -- Shift+Enter で改行（LF）を直接送る（Claude Code 用）
  { key = 'Enter', mods = 'SHIFT', action = act.SendString '\n' },
  -- 新規タブで開く
  { key = 'w', mods = 'LEADER', action = act.SpawnCommandInNewTab { domain = WSL } },
  { key = 'p', mods = 'LEADER', action = act.SpawnCommandInNewTab { domain = LOCAL, args = { 'powershell.exe' }, cwd = PS_CWD } },
  -- Git Bash を新規タブで開く
  { key = 'g', mods = 'LEADER', action = act.SpawnCommandInNewTab { domain = LOCAL, args = GIT_BASH, cwd = PS_CWD } },
  -- 管理者PowerShell（gsudo経由でUAC昇格）を新規タブで開く
  { key = 'p', mods = 'LEADER|CTRL', action = act.SpawnCommandInNewTab { domain = LOCAL, args = { 'gsudo.exe', 'powershell.exe' }, cwd = PS_CWD } },
  -- 横ペイン（左右に分割）で開く
  { key = 'w', mods = 'LEADER|SHIFT', action = act.SplitHorizontal { domain = WSL } },
  { key = 'p', mods = 'LEADER|SHIFT', action = act.SplitHorizontal { domain = LOCAL, args = { 'powershell.exe' }, cwd = PS_CWD } },
  -- 縦ペイン（上下に分割）で開く
  { key = 'w', mods = 'LEADER|ALT', action = act.SplitVertical { domain = WSL } },
  { key = 'p', mods = 'LEADER|ALT', action = act.SplitVertical { domain = LOCAL, args = { 'powershell.exe' }, cwd = PS_CWD } },
  -- 対象ペインだけを閉じる（タブは残す）
  { key = 'x', mods = 'LEADER', action = act.CloseCurrentPane { confirm = true } },
}

return M
