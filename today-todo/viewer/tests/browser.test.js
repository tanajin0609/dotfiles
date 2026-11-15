'use strict';

// 実ブラウザでの通しテスト。viewer は npm 依存を持たないため、Playwright が入っている環境でだけ動かし、無ければ飛ばす。

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { setupFixture, startViewerServer } = require('./helpers');

let chromium = null;
try {
  ({ chromium } = require('playwright'));
} catch {}

async function openBoard(t, lines) {
  if (!chromium) {
    t.skip('playwright が無い環境');
    return null;
  }
  let browser;
  try {
    browser = await chromium.launch();
  } catch (err) {
    t.skip(`ブラウザを起動できない環境: ${err.message}`);
    return null;
  }
  const fixture = setupFixture();
  fs.writeFileSync(path.join(fixture.todoDir, fixture.todoFile), lines.join('\n'));
  const server = await startViewerServer({ VIEWER_TODO_DIR: fixture.todoDir, VIEWER_DATA_DIR: fixture.dataDir });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  // marked の CDN に出られない環境でも同じ結果になるよう、取得を失敗させて原文表示の経路で確かめる。
  await context.route('https://cdn.jsdelivr.net/**', (route) => route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(server.baseUrl.replace('127.0.0.1', 'localhost'));
  await page.getByRole('button', { name: /カードA/ }).first().waitFor();
  return {
    fixture, server, page, errors,
    async close() {
      await browser.close();
      await server.stop();
    },
  };
}

const TODO = ['# 2026-01-01', '', '## demo-project', '', '### カードA', '- [ ] #1 タスクA', '', '### カードB', '- [ ] #2 タスクB <img src=x onerror="window.__xss=1">', ''];

test('ボードが開き、カードの★と「今日やる」がサーバーに保存されて読み直しても残る', async (t) => {
  const ctx = await openBoard(t, TODO);
  if (!ctx) return;
  const { page, fixture, errors } = ctx;
  try {
    await page.getByRole('button', { name: 'カードA に★を付ける' }).click();
    await page.getByRole('button', { name: /カードA のステータス: 未着手/ }).click();
    await page.waitForTimeout(500);
    const marks = JSON.parse(fs.readFileSync(path.join(fixture.dataDir, 'card-marks.json'), 'utf-8'));
    const saved = Object.values(marks);
    assert.equal(saved.length, 1);
    assert.equal(saved[0].starred, true);
    assert.equal(saved[0].status, 'today');

    await page.reload();
    await page.getByRole('button', { name: 'カードA の★を外す' }).waitFor();
    assert.match(await page.locator('#flowTodayList').innerText(), /カードA/);
    assert.deepEqual(errors, []);
  } finally {
    await ctx.close();
  }
});

test('カードを開くと詳細ダイアログにタスクが出て、タスク本文の HTML は実行されない', async (t) => {
  const ctx = await openBoard(t, TODO);
  if (!ctx) return;
  const { page, errors } = ctx;
  try {
    await page.locator('.group-card', { hasText: 'カードB' }).click();
    const dialog = page.locator('#cardDialog');
    await dialog.waitFor({ state: 'visible' });
    assert.match(await dialog.innerText(), /タスクB/);
    assert.equal(await page.evaluate(() => window.__xss), undefined);
    assert.deepEqual(errors, []);
  } finally {
    await ctx.close();
  }
});

test('昨日の日付のボードには帯が出て、todo-import の案内がある', async (t) => {
  const ctx = await openBoard(t, TODO);
  if (!ctx) return;
  const { page } = ctx;
  try {
    const notice = page.locator('#staleBoardNotice');
    await notice.waitFor({ state: 'visible' });
    assert.match(await notice.innerText(), /01\/01 のボード/);
    assert.equal(await page.getByRole('button', { name: 'todo-import を実行' }).isVisible(), true);
  } finally {
    await ctx.close();
  }
});
