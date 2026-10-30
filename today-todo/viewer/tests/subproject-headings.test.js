'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// 描画関数はブラウザ前提でDOMを要するため、並びを決める純粋関数だけを index.html から取り出して検証する。
function loadFunctions(names) {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf-8');
  const context = {};
  for (const name of names) {
    const start = html.indexOf(`\nfunction ${name}(`);
    assert.notEqual(start, -1, `${name} が index.html に無い`);
    const end = html.indexOf('\n}\n', start);
    vm.runInNewContext(`${html.slice(start, end + 2)}\nthis.${name} = ${name};`, context);
  }
  return context;
}

const { clusterMatchesByParent } = loadFunctions(['splitGroupTitle', 'clusterMatchesByParent']);
const match = (title) => ({ group: { title } });
const shape = (sections) => JSON.parse(JSON.stringify(sections.map((s) => [s.parent, s.matches.map((m) => m.group.title)])));

// AC-SPH-1
test('同じサブプロジェクトのカードを最初に現れた位置に集め、内部の並びは保つ', () => {
  const sections = clusterMatchesByParent([
    match('a ▸ 1'), match('b ▸ 1'), match('a ▸ 2'), match('c'), match('b ▸ 2'),
  ]);
  assert.deepEqual(shape(sections), [
    ['a', ['a ▸ 1', 'a ▸ 2']],
    ['b', ['b ▸ 1', 'b ▸ 2']],
    ['', ['c']],
  ]);
});

// AC-SPH-1
test('▸ を含まないカード同士も1か所に集める', () => {
  const sections = clusterMatchesByParent([match('x'), match('a ▸ 1'), match('y')]);
  assert.deepEqual(shape(sections), [['', ['x', 'y']], ['a', ['a ▸ 1']]]);
});
