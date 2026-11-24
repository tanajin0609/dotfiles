async function init() {
  observeHeaderHeight();
  setupCardPanelResize();
  const themeSelect = document.getElementById('themeSelect');
  themeSelect.value = document.documentElement.dataset.theme;
  themeSelect.addEventListener('change', () => applyAndSaveTheme(themeSelect.value));
  const skinSelect = document.getElementById('skinSelect');
  skinSelect.value = document.documentElement.dataset.skin;
  skinSelect.addEventListener('change', () => applyAndSaveSkin(skinSelect.value));
  document.getElementById('historyPopover').addEventListener('beforetoggle', (e) => {
    if (e.newState === 'open') placePopoverBelow(e.currentTarget, document.getElementById('historyToggle'));
  });
  document.getElementById('settingsPopover').addEventListener('beforetoggle', (e) => {
    if (e.newState === 'open') placePopoverBelow(e.currentTarget, document.getElementById('settingsToggle'));
  });
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  if (isMac) {
    for (const kbd of document.querySelectorAll('kbd[data-mod-key]')) kbd.textContent = '⌘';
  }
  bindSubmitShortcut(document.getElementById('globalCommentInput'), submitGlobalComment);
  setupInbox();
  setupChat();
  bindSubmitShortcut(document.getElementById('newCardTextInput'), submitNewCard);
  bindSubmitShortcut(document.getElementById('modalTaskInput'), submitModalTask);
  for (const id of RICH_INPUT_IDS) enhanceRichInput(document.getElementById(id));
  bindSubmitShortcut(document.getElementById('modalCommentInput'), saveModalCommentAndLaunch);
  bindLaunchOnEnter(document.getElementById('modalCommentInput'), saveModalCommentAndLaunch);
  bindLaunchOnEnter(document.getElementById('sessionLogReplyInput'), submitSessionLogReply);
  document.addEventListener('keydown', onShortcutKeydown);
  document.getElementById('shortcutHelpBtn').addEventListener('click', openShortcutDialog);
  document.getElementById('costBtn').addEventListener('click', () => { location.href = '/costs'; });
  document.getElementById('sessionArtifactsBtn').addEventListener('click', () => openSessionArtifacts(sessionLogView));
  document.getElementById('modalSessionArtifactsBtn').addEventListener('click', () => openSessionArtifacts(modalLogView));
  document.getElementById('sessionListBtn').addEventListener('click', openSessionListDialog);
  const sessionListDialog = document.getElementById('sessionListDialog');
  document.getElementById('sessionListCloseBtn').addEventListener('click', () => sessionListDialog.close());
  sessionListDialog.addEventListener('click', (e) => {
    if (e.target === sessionListDialog) sessionListDialog.close();
  });
  sessionListDialog.addEventListener('close', () => {
    clearInterval(sessionListTimer);
    sessionListTimer = null;
    attachToastRegionToTopmostDialog();
    restoreFocusReturn(sessionListFocusReturn);
    sessionListFocusReturn = null;
  });
  refreshRateLimits();
  setInterval(refreshRateLimits, 60000);
  document.getElementById('skillsBtn').addEventListener('click', openSkillsDialog);
  document.getElementById('todoImportBtn').addEventListener('click', startTodoImport);
  document.getElementById('markAllSeenBtn').addEventListener('click', markAllSeen);
  document.getElementById('board').addEventListener('dragover', onColumnDragOver);
  document.getElementById('board').addEventListener('drop', onColumnDrop);
  const skillsDialog = document.getElementById('skillsDialog');
  document.getElementById('skillsCloseBtn').addEventListener('click', () => skillsDialog.close());
  skillsDialog.addEventListener('click', (e) => {
    if (e.target === skillsDialog) skillsDialog.close();
  });
  skillsDialog.addEventListener('close', () => {
    clearInterval(skillsDialogTimer);
    skillsDialogTimer = null;
    attachToastRegionToTopmostDialog();
    restoreFocusReturn(skillsDialogFocusReturn);
    skillsDialogFocusReturn = null;
  });
  document.getElementById('skillsFilterInput').addEventListener('input', renderSkillsList);
  document.getElementById('skillCreateBtn').addEventListener('click', createSkill);
  document.getElementById('skillReplyBtn').addEventListener('click', replySkillSession);
  document.getElementById('sessionCreateBtn').addEventListener('click', createManagedSession);
  document.getElementById('sessionManageReplyBtn').addEventListener('click', replyManagedSession);
  document.getElementById('sessionManageStopBtn').addEventListener('click', () => stopOrDeleteManagedSession('stop'));
  document.getElementById('sessionManageDeleteBtn').addEventListener('click', () => stopOrDeleteManagedSession('delete'));
  bindSubmitShortcut(document.getElementById('sessionCreateInput'), createManagedSession);
  bindSubmitShortcut(document.getElementById('sessionManageReplyInput'), replyManagedSession);
  bindSubmitShortcut(document.getElementById('skillRequestInput'), createSkill);
  setupSkillSuggest();
  document.getElementById('modelSettingsBtn').addEventListener('click', openModelSettingsDialog);
  loadLaunchSettingsOverride();
  document.getElementById('modelSettingsSubmit').addEventListener('click', saveModelSettings);
  const modelSettingsDialog = document.getElementById('modelSettingsDialog');
  document.getElementById('modelSettingsDialogCloseBtn').addEventListener('click', () => modelSettingsDialog.close());
  modelSettingsDialog.addEventListener('click', (e) => {
    if (e.target === modelSettingsDialog) modelSettingsDialog.close();
  });
  modelSettingsDialog.addEventListener('close', () => {
    attachToastRegionToTopmostDialog();
    restoreFocusReturn(modelSettingsDialogFocusReturn);
    modelSettingsDialogFocusReturn = null;
  });
  const shortcutDialog = document.getElementById('shortcutDialog');
  document.getElementById('shortcutDialogCloseBtn').addEventListener('click', () => shortcutDialog.close());
  shortcutDialog.addEventListener('click', (e) => {
    if (e.target === shortcutDialog) shortcutDialog.close();
  });
  shortcutDialog.addEventListener('close', () => {
    attachToastRegionToTopmostDialog();
    restoreFocusReturn(shortcutDialogFocusReturn);
    shortcutDialogFocusReturn = null;
  });
  document.getElementById('searchInput').addEventListener('input', (e) => {
    const nextQuery = e.target.value.trim().toLowerCase();
    if (nextQuery === searchQuery) return;
    updateBoardFilter(() => { searchQuery = nextQuery; });
  });
  for (const chip of document.querySelectorAll('#filterChips .chip')) {
    chip.addEventListener('click', () => updateBoardFilter(() => {
      const filterId = chip.dataset.filterId;
      if (activeFilterIds.has(filterId)) activeFilterIds.delete(filterId);
      else activeFilterIds.add(filterId);
    }));
  }
  document.getElementById('staleBoardImportBtn').addEventListener('click', () => document.getElementById('todoImportBtn').click());
  document.getElementById('loadErrorRetryBtn').addEventListener('click', () => {
    if (failedBoardFile) loadBoard(failedBoardFile);
  });
  document.getElementById('modalStarBtn').addEventListener('click', () => {
    if (modalGroup) toggleGroupStar(modalGroup.id);
  });
  document.getElementById('focusRestartBtn').addEventListener('click', restartFocusRound);
  // 共有されたURLを同じタブに貼った場合も、読み込み時と同じ手順で状態を復元する。
  window.addEventListener('hashchange', () => location.reload());
  document.addEventListener('click', (e) => {
    if (!openedActionMenu) return;
    if (openedActionMenu.menu.contains(e.target) || openedActionMenu.button.contains(e.target)) return;
    closeActionMenu(false);
  });

  resumeTodoImportWatch();
  const files = await loadFileList();
  // todoが無くても以降のイベント登録は続ける。初回のtodo-import完了後にボードが読み込まれるため。
  if (files.length === 0) {
    renderFirstRunGuide();
  } else {
    const hashState = readUrlHashState();
    const isHashFileLatest = !!hashState && hashState.file === files[0];
    const isLoaded = await loadBoard(files[0]);
    if (isLoaded && isHashFileLatest) restoreUrlViewState(hashState);
  }

  document.getElementById('reloadBtn').addEventListener('click', () => { if (currentFile) loadBoard(currentFile); });
  document.getElementById('shareAllBtn').addEventListener('click', () => {
    if (!boardData) return;
    const pairs = [];
    for (const column of boardData.columns) {
      for (const group of column.groups) pairs.push({ column: column.name, group });
    }
    copyPrompt('全体', pairs);
  });
  document.getElementById('focusModeBtn').addEventListener('click', toggleFocusMode);
  document.getElementById('focusCloseBtn').addEventListener('click', exitFocusMode);
  document.getElementById('focusDialog').addEventListener('cancel', (e) => {
    e.preventDefault();
    exitFocusMode();
  });
  // マウスで押した後もSpace（チェック）が効くよう、ポインター操作のときだけボタンからフォーカスを外す。
  document.getElementById('focusLaterBtn').addEventListener('click', (e) => {
    deferFocusCard();
    if (e.detail > 0) moveFocusIntoFocusPanel();
  });
  document.getElementById('focusNextBtn').addEventListener('click', (e) => {
    advanceFocus();
    if (e.detail > 0) moveFocusIntoFocusPanel();
  });
  document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
  const commentExpandBtn = document.getElementById('modalCommentExpandBtn');
  const renderCommentExpandBtn = (expanded) => {
    commentExpandBtn.replaceChildren(icon(expanded ? 'shrink' : 'enlarge'));
    commentExpandBtn.setAttribute('aria-pressed', String(expanded));
    const label = expanded ? 'セッションをパネル内に表示' : 'セッションを横に広げて表示';
    commentExpandBtn.setAttribute('aria-label', label);
    commentExpandBtn.dataset.tip = label;
  };
  const commentsSection = commentExpandBtn.closest('.modal-comments');
  const sessionExpanded = localStorage.getItem(CARD_SESSION_EXPANDED_KEY) !== '0';
  commentsSection.classList.toggle('is-expanded', sessionExpanded);
  renderCommentExpandBtn(sessionExpanded);
  commentExpandBtn.addEventListener('click', () => {
    const expanded = commentsSection.classList.toggle('is-expanded');
    localStorage.setItem(CARD_SESSION_EXPANDED_KEY, expanded ? '1' : '0');
    renderCommentExpandBtn(expanded);
  });
  const cardDialog = document.getElementById('cardDialog');
  cardDialog.addEventListener('close', onCardDialogClosed);
  cardDialog.addEventListener('click', (e) => {
    if (e.target === cardDialog) closeModal();
  });
  document.getElementById('modalCommentLaunchBtn').addEventListener('click', saveModalCommentAndLaunch);
  document.getElementById('modalCommentNewSessionBtn').addEventListener('click', saveModalCommentAndLaunchNewSession);
  document.getElementById('modalTaskSubmit').addEventListener('click', submitModalTask);
  document.getElementById('globalCommentSubmit').addEventListener('click', submitGlobalComment);
  document.getElementById('globalCommentsCopyBtn').addEventListener('click', copyGlobalComments);
  document.getElementById('newCardSubmit').addEventListener('click', submitNewCard);
  document.getElementById('newCardColumnInput').addEventListener('change', refreshNewCardBacklogTargets);
  document.getElementById('globalCommentsOpenBtn').addEventListener('click', openGlobalCommentsDialog);
  const newCardDialog = document.getElementById('newCardDialog');
  document.getElementById('newCardDialogCloseBtn').addEventListener('click', () => newCardDialog.close());
  newCardDialog.addEventListener('click', (e) => {
    if (e.target === newCardDialog) newCardDialog.close();
  });
  newCardDialog.addEventListener('close', () => {
    attachToastRegionToTopmostDialog();
    restoreFocusReturn(newCardDialogFocusReturn);
    newCardDialogFocusReturn = null;
  });
  const globalCommentsDialog = document.getElementById('globalCommentsDialog');
  document.getElementById('globalCommentsDialogCloseBtn').addEventListener('click', () => globalCommentsDialog.close());
  globalCommentsDialog.addEventListener('click', (e) => {
    if (e.target === globalCommentsDialog) globalCommentsDialog.close();
  });
  globalCommentsDialog.addEventListener('close', () => {
    attachToastRegionToTopmostDialog();
    restoreFocusReturn(globalCommentsDialogFocusReturn);
    globalCommentsDialogFocusReturn = null;
  });
  document.getElementById('sessionLogCloseBtn').addEventListener('click', closeSessionLogModal);
  document.getElementById('docCloseBtn').addEventListener('click', () => document.getElementById('docDialog').close());
  document.getElementById('docQuoteBtn').addEventListener('click', quoteDocSelection);
  window.addEventListener('resize', () => docAnnoRelayout());
  document.getElementById('docReviewLaunchBtn').addEventListener('click', () => sendDocReview());
  document.getElementById('docReviewNewSessionBtn').addEventListener('click', () => sendDocReview({ newSession: true }));
  document.getElementById('docDialog').addEventListener('close', onDocDialogClosed);
  document.getElementById('sessionLogReplyBtn').addEventListener('click', submitSessionLogReply);
  document.getElementById('sessionLogNewSessionBtn').addEventListener('click', branchSessionFromLatestEntry);
  const sessionLogDialog = document.getElementById('sessionLogDialog');
  sessionLogDialog.addEventListener('close', onSessionLogDialogClosed);
  sessionLogDialog.addEventListener('click', (e) => {
    if (e.target === sessionLogDialog) closeSessionLogModal();
  });

  const sessionLogReplyInput = document.getElementById('sessionLogReplyInput');
  sessionLogReplyInput.addEventListener('dragover', (e) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    sessionLogReplyInput.classList.add('drag-over');
  });
  sessionLogReplyInput.addEventListener('dragleave', () => sessionLogReplyInput.classList.remove('drag-over'));
  sessionLogReplyInput.onPasteFiles = (files) => {
    if (!sessionLogView.groupId || !findGroupById(sessionLogView.groupId)) {
      showToast('添付は表示中のtodoファイルのセッションだけが対象です');
      return;
    }
    attachDroppedFiles(sessionLogReplyInput, sessionLogView.groupId, files);
  };
  sessionLogReplyInput.addEventListener('drop', (e) => {
    if (e.dataTransfer.files.length === 0) return;
    e.preventDefault();
    sessionLogReplyInput.classList.remove('drag-over');
    sessionLogReplyInput.onPasteFiles(e.dataTransfer.files);
  });

  const commentInput = document.getElementById('modalCommentInput');
  commentInput.addEventListener('dragover', (e) => {
    e.preventDefault();
    commentInput.classList.add('drag-over');
  });
  commentInput.onPasteFiles = (files) => { if (modalGroup) attachDroppedFiles(commentInput, modalGroup.id, files); };
  commentInput.addEventListener('dragleave', () => commentInput.classList.remove('drag-over'));
  commentInput.addEventListener('drop', (e) => {
    e.preventDefault();
    commentInput.classList.remove('drag-over');
    if (e.dataTransfer.files.length > 0) {
      commentInput.onPasteFiles(e.dataTransfer.files);
      return;
    }
    const text = e.dataTransfer.getData('text/plain');
    if (text) addQuoteChip('modalCommentInput', `> ${text}`);
  });

  bindSessionLogQuote(modalLogView);
  bindSessionLogQuote(sessionLogView);

  setupNotifyButton();
  document.getElementById('bulkLaunchOpenBtn').addEventListener('click', openBulkLaunchDialog);
  document.getElementById('bulkLaunchSubmit').addEventListener('click', submitBulkLaunch);
  document.getElementById('bulkLaunchCloseBtn').addEventListener('click', () => document.getElementById('bulkLaunchDialog').close());
  document.getElementById('dayReviewOpenBtn').addEventListener('click', openDayReviewDialog);
  document.getElementById('dayReviewCopyBtn').addEventListener('click', copyDayReview);
  document.getElementById('dayReviewCloseBtn').addEventListener('click', () => document.getElementById('dayReviewDialog').close());
  refreshOffCardSessions();
  setInterval(() => {
    refreshSessions();
    refreshOffCardSessions();
    detectExternalBoardUpdate();
  }, 5000);
}

init();
