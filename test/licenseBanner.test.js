const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const ejs = require('ejs');

const file = path.join(__dirname, '..', 'views', 'admin', 'layouts', 'master.ejs');
const render = (licenseState) => ejs.renderFile(file, { body: '', settings: {}, licenseState, appBase: '' });

test('aviso de licencia suspendida solo con reason suspended y readonly', async () => {
  const sus = await render({ mode: 'readonly', reason: 'suspended' });
  assert.match(sus, /Licencia suspendida\. El sistema está en modo solo lectura/);
  assert.match(sus, /\/admin\/license/);
  for (const st of [{ mode: 'readonly', reason: 'expired' }, { mode: 'grace', reason: 'suspended' }, { mode: 'ok' }, undefined]) {
    assert.doesNotMatch(await render(st), /Licencia suspendida\./);
  }
});
