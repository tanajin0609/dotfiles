# Todo

## 進行中

### ゲーム開発skillの出典の裏取り
- [ ] #1 面白さの仕組み節の出典11件を論文本文で照合し、未確認の注記と出典9の結果を更新する（論文サイトへの通信許可が必要） → [.claude/skills/game-dev/references/design.md](../../.claude/skills/game-dev/references/design.md)

### ゲーム制作ワークフローの実地確認
- [ ] #2 レビューコマンドを試作1本に対して初見の実行者で試走し、指示の欠陥を直す → [.claude/commands/game-review.md](../../.claude/commands/game-review.md)
- [ ] #3 人が遊んで良いと判定した演出だけを、コードで描く演出の初期値として追記する（人の判定が前提） → [.claude/skills/game-dev/references/art-sound-ui.md](../../.claude/skills/game-dev/references/art-sound-ui.md)

### 公開できる状態のインストール導線
- [ ] #4 リンク先が同梱されていないskillのsymlink（yomiyasu・find-skills）と.trashを追跡から外す（手元の既存リンクが消えるので外す前に再導入手順を用意する） → [.gitignore](../../.gitignore)
- [ ] #5 install.ps1でもtoday-todo-viewerの起動コマンドを作る（Windowsネイティブでのclaude CLI起動を実機確認する） → [install.ps1](../../install.ps1)

### 複数プロジェクトの作業環境の整理
- [ ] #6 用途別にクラウド環境を分け、各環境の許可ホストを用途の分だけにする → [docs/tasks/dev-env-plan.md](dev-env-plan.md)
- [x] #7 backlog の行IDを作業の起点と終点にするルールを CLAUDE.md に追加する → [docs/tasks/dev-env-plan.md](dev-env-plan.md)
- [ ] #8 全プロジェクトの止まりどころを毎朝1ページにまとめるスケジュール実行を作る（#6・#7 の後） → [docs/tasks/dev-env-plan.md](dev-env-plan.md)
- [ ] #9 各リポジトリを1コマンドで立ち上がるようにし、クラウドと手元のコンテナで共通化する（#6 の後） → [docs/tasks/dev-env-plan.md](dev-env-plan.md)
- [ ] #10 手元の平文の秘密ファイルをシークレット管理に集め、実行時だけ渡す（#9 の後、導入前に要確認） → [docs/tasks/dev-env-plan.md](dev-env-plan.md)

## 完了（archives/へ移動済み）
