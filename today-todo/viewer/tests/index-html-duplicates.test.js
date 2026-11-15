'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { readViewerSource } = require('./viewer-source');

// 同じスクリプト内の同名の関数宣言はエラーにならず後勝ちで上書きされ、別の戻り値を期待する呼び出し元が黙って壊れる。
test('画面のスクリプト（index.html＋static/*.js）・costs.html に同名のトップレベル関数宣言が無い', () => {
  const sources = { 'index.html＋static/*.js': readViewerSource(), 'costs.html': fs.readFileSync(path.join(__dirname, '..', 'costs.html'), 'utf-8') };
  for (const [file, html] of Object.entries(sources)) {
    const names = [...html.matchAll(/^(?:async )?function\*? ?([A-Za-z0-9_$]+)\s*\(/gm)].map((m) => m[1]);
    const duplicates = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))];
    assert.deepEqual(duplicates, [], `${file} の重複: ${duplicates.join(', ')}`);
  }
});
