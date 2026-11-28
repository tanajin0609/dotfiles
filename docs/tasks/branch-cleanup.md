# リモートブランチの整理

クラウドセッションは自分の作業ブランチ以外へpushできない（プロキシが403で拒否する）ため、削除は手元で実行する。

## #17 マージ済み（PRのheadと同一SHA、またはmainに含まれる）40本

PR画面の「Restore branch」で復元できる。

```bash
git push origin --delete add-repair-skill blog-neta-auto-pr claude/auto-merge-own-prs claude/automerge-session-rules claude/bold-clarke-tt5zp9 claude/ecstatic-gates-v6d5g4 claude/elegant-ride-vxbscj claude/gifted-pascal-sk6pzp claude/kind-archimedes-5yj83u claude/merge-first-rule claude/optimistic-goodall-u7df66 claude/resolve-conflicts-xapt9r claude/uiux-review-axe-measure claude/uiux-review-self-verify claude/vigilant-einstein-1te698 feat-column-backlog-sync feat-comment-attachments feat-diagram-drawio-assets feat-new-session-launch feat-proposal-viewer feat-untrusted-ws-trust feat-viewer-bulk-launch-and-review feat-viewer-carry-over-days feat-viewer-change-summary feat-viewer-palette feat-viewer-saas-redesign feat-viewer-waiting-overview fix-backlog-writeback fix-column-sync-status-heading-child-task fix-resume-done-copy fix-status-toggle fix-third-party-skill-licensing fix-uiux-review fix-viewer-escape-task-html fix-viewer-safe-file-writes fix-viewer-server-hardening refactor-viewer-server-routes refactor-viewer-split-index test-viewer-browser-e2e claude/quirky-ptolemy-g1wq9g
```

以後溜めないよう、GitHubのSettings → General →「Automatically delete head branches」を有効にする。

## #18 mainと共通祖先が無い旧履歴の11本

mainの履歴が書き換えられる前のブランチで、PRも無い。`git cherry`では取り込み判定できない（squash/書き換えで全コミットが未取込に見える）。各ブランチ先頭の変更がmainの該当ファイルに入っているかを見て、入っていれば削除、入っていなければ新しいPRに載せ直す。

| ブランチ | 先頭コミット（日付・件名） |
|---|---|
| claude/keen-maxwell-f5gmzw | 2026-10-25 image-gen-inbox skill を足す |
| feat-viewer-launch-model-select | 2026-10-15 送信欄でmodel/effortを選んで依頼 |
| feat-viewer-skill-screen | 2026-10-15 スキル一覧・skill作成依頼の画面 |
| feat-viewer-sticky-skin | 2026-10-05 viewerのCSSをSticky基準で同期 |
| feat-viewer-visual-refresh | 2026-09-30 viewerのCSSをデザインシステムとして同期 |
| feat/uiux-review-checklist-coverage | 2026-10-16 EAA零細除外・AI Act第50条の照合 |
| fix-bals-task-handoff | 2026-10-13 backlog追記をコマンド非依存のルールに |
| fix-resume-old-job-cleanup | 2026-10-05 旧ジョブがstoppedで溜まらないように |
| fix-todo-import-orphan-abs-links | 2026-10-16 孤立行を出さず相対リンクを絶対パスで転記 |
| fix-viewer-claude-integration | 2026-10-06 回答待ちジョブにも選択肢を出す |
| fix-viewer-task-delete-undo | 2026-10-16 タスク削除を「元に戻す」付きの遅延送信に |
