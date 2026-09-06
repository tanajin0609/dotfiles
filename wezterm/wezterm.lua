local wezterm = require 'wezterm'
local keybind = require 'keybind'
local config = wezterm.config_builder()

config.automatically_reload_config = true
config.font_size = 12.0
-- 英数字+アイコンは JetBrains Mono Nerd Font、日本語は MS Gothic にフォールバック
config.font = wezterm.font_with_fallback({
  'JetBrainsMono NF',
  'MS Gothic',
})
config.use_ime = true
config.window_background_opacity = 0.75
config.macos_window_background_blur = 20
config.window_decorations = "RESIZE"

-- タブバーの「+」（新規タブ）ボタンを非表示
config.show_new_tab_button_in_tab_bar = false
-- レトロ式タブバーにする（fancy 式の「×」閉じるボタンを無くす）
config.use_fancy_tab_bar = false

-- WSL ドメインを明示定義する（起動ディレクトリは WSL ディストロの既定ホームに任せる）
config.wsl_domains = {
  {
    name = 'WSL:Ubuntu-24.04',
    distribution = 'Ubuntu-24.04',
    default_cwd = '~/projects',
  },
}
-- 起動時に使用するシェル（未指定だと Windows では cmd.exe になる）
-- ※ default_domain を WSL にしたため、これはローカルドメイン（launch_menu の PowerShell 等）用
config.default_prog = { 'WSL:Ubuntu-24.04' }

-- 既定のドメインを WSL(Ubuntu-24.04) にする（新規ウィンドウ/タブが WSL 上で開く）
config.default_domain = 'WSL:Ubuntu-24.04'

config.window_frame = {
  inactive_titlebar_bg = "none",
  active_titlebar_bg = "none",
}
 config.colors = {
   -- 背景色を青に
   background = "#1a1a4e",
   tab_bar = {
     -- タブバーの地色をターミナル背景と同色にして一体化
     background = "#1a1a4e",
     inactive_tab_edge = "none",
   },
 }

 -- タブ幅を少し広めに
 config.tab_max_width = 28

 -- スラント（斜め）区切り用の Powerline グリフ
 local SLANT_LEFT = utf8.char(0xe0ba)   -- 左端の斜め（）
 local SLANT_RIGHT = utf8.char(0xe0bc)  -- 右端の斜め（）
 wezterm.on("format-tab-title", function(tab, tabs, panes, config, hover, max_width)
   local edge = "#1a1a4e"        -- タブバー地（背景と同色）
   local background = "#5c6d74"  -- 非アクティブタブ
   local foreground = "#FFFFFF"

   if tab.is_active then
     -- カレントタブの色を青に
     background = "#3155d4"
     foreground = "#FFFFFF"
   elseif hover then
     -- マウスオーバー時は少し明るく
     background = "#7a8c94"
     foreground = "#FFFFFF"
   end

   local title = wezterm.truncate_right(tab.active_pane.title, max_width - 4)

   return {
     -- 左の斜め（地色→タブ色）
     { Background = { Color = edge } },
     { Foreground = { Color = background } },
     { Text = SLANT_LEFT },
     -- タブ本体
     { Background = { Color = background } },
     { Foreground = { Color = foreground } },
     { Text = " " .. title .. " " },
     -- 右の斜め（タブ色→地色）
     { Background = { Color = edge } },
     { Foreground = { Color = background } },
     { Text = SLANT_RIGHT },
   }
 end)

config.launch_menu = {
  { label = 'PowerShell', args = { 'powershell.exe' } },
  -- gsudo経由で管理者PowerShellを起動（選択時にUACダイアログが出る）
  { label = 'PowerShell (管理者)', args = { 'gsudo.exe', 'powershell.exe' } },
  { label = 'WSL (Ubuntu)', args = { 'wsl.exe' } },
}

config.leader = keybind.leader
config.keys = keybind.keys

return config
