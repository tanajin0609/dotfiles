local wezterm = require 'wezterm'
local act = wezterm.action

local M = {}

M.leader = { key = 'a', mods = 'CTRL', timeout_milliseconds = 1000 }

-- 既定ドメインが WSL のため、PowerShell 系は明示的にローカルドメインで起動する
local LOCAL = { DomainName = 'local' }
-- Windows ユーザープロファイル（C:\Users\<user>）を環境変数から解決
local PS_CWD = os.getenv('USERPROFILE')

-- WSL ドメイン定義（domain には DomainName のみを含める）
local WSL = { DomainName = 'WSL:Ubuntu-26.04' }
-- WSL の起動ディレクトリ（'~' でホーム、'~/projects' でプロジェクトフォルダ）
local WSL_CWD = '~/projects'

-- Git Bash（ログインシェルとして起動）
local GIT_BASH = { 'C:\\Program Files\\Git\\bin\\bash.exe', '-i', '-l' }

M.keys = {
  -- Shift+Enter で改行（LF）を直接送る（Claude Code 用）
  { key = 'Enter', mods = 'SHIFT', action = act.SendString '\n' },
  
  -- 新規タブで開く
  { key = 'w', mods = 'LEADER', action = act.SpawnCommandInNewTab { domain = WSL, cwd = WSL_CWD } },
  -- WSL を /mnt/c/Users/IGPF-2500009 ディレクトリで開く
  { key = 'h', mods = 'LEADER', action = act.SpawnCommandInNewTab { domain = WSL, cwd = '/mnt/c/Users/IGPF-2500009' } },
  { key = 'p', mods = 'LEADER', action = act.SpawnCommandInNewTab { domain = LOCAL, args = { 'powershell.exe' }, cwd = PS_CWD } },
  -- Git Bash を新規タブで開く
  { key = 'g', mods = 'LEADER', action = act.SpawnCommandInNewTab { domain = LOCAL, args = GIT_BASH, cwd = PS_CWD } },
  -- 管理者PowerShell（gsudo経由でUAC昇格）を新規タブで開く
  { key = 'p', mods = 'LEADER|CTRL', action = act.SpawnCommandInNewTab { domain = LOCAL, args = { 'gsudo.exe', 'powershell.exe' }, cwd = PS_CWD } },
  
  -- 横ペイン（左右に分割）で開く
  { key = 'w', mods = 'LEADER|SHIFT', action = act.SplitHorizontal { domain = WSL, cwd = WSL_CWD } },
  { key = 'p', mods = 'LEADER|SHIFT', action = act.SplitHorizontal { domain = LOCAL, args = { 'powershell.exe' }, cwd = PS_CWD } },
  
  -- 縦ペイン（上下に分割）で開く
  { key = 'w', mods = 'LEADER|ALT', action = act.SplitVertical { domain = WSL, cwd = WSL_CWD } },
  { key = 'p', mods = 'LEADER|ALT', action = act.SplitVertical { domain = LOCAL, args = { 'powershell.exe' }, cwd = PS_CWD } },
  
  -- 対象ペインだけを閉じる（タブは残す）
  { key = 'x', mods = 'LEADER', action = act.CloseCurrentPane { confirm = true } },
}

return M