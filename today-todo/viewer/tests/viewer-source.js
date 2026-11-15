'use strict';

const fs = require('fs');
const path = require('path');

// 画面のスクリプトは index.html と static/*.js に分かれていて、ブラウザは全部を1つのグローバルとして読む。
function readViewerSource() {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf-8');
  const scripts = [...html.matchAll(/<script src="\/static\/([\w-]+\.js)"><\/script>/g)]
    .map((m) => fs.readFileSync(path.join(root, 'static', m[1]), 'utf-8'));
  return [html, ...scripts].join('\n');
}

module.exports = { readViewerSource };
