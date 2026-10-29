'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// 同じスクリプト内の同名の関数宣言はエラーにならず後勝ちで上書きされ、別の戻り値を期待する呼び出し元が黙って壊れる。
test('index.html・costs.html に同名のトップレベル関数宣言が無い', () => {
  for (const file of ['index.html', 'costs.html']) {
    const html = fs.readFileSync(path.join(__dirname, '..', file), 'utf-8');
    const names = [...html.matchAll(/^(?:async )?function\*? ?([A-Za-z0-9_$]+)\s*\(/gm)].map((m) => m[1]);
    const duplicates = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))];
    assert.deepEqual(duplicates, [], `${file} の重複: ${duplicates.join(', ')}`);
  }
});
