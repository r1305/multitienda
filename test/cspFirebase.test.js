const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');
const line = src.split('\n').find((l) => l.includes('scriptSrc:'));
const hosts = line.match(/"[^"]+"/g).map((s) => s.slice(1, -1));

test('script-src permite fallback long-polling de Firebase RTDB', () => {
  assert.ok(hosts.includes('https://*.firebaseio.com'));
  assert.ok(hosts.includes('https://*.firebasedatabase.app'));
});

test('script-src sin comodin general ni http', () => {
  assert.ok(!hosts.includes('*'));
  assert.ok(!hosts.some((h) => h.startsWith('http:')));
});
