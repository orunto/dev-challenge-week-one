import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readConfig } from '../src/config.js';
import { startupFailure } from '../src/startup.js';

test('startup diagnostics identify port conflicts without disclosing raw error text', () => {
  const error = Object.assign(new Error('PRIVATE_HOST_AND_ERROR_FIXTURE'), { code: 'EADDRINUSE' });
  const event = startupFailure(error, 'listen');
  assert.equal(event.code, 'EADDRINUSE');
  assert.equal(event.stage, 'listen');
  assert.ok(!JSON.stringify(event).includes('PRIVATE_HOST_AND_ERROR_FIXTURE'));
  const unexpected = startupFailure({ code: 'PRIVATE_ERROR_CODE', message: 'PRIVATE_MESSAGE' }, 'application');
  assert.equal(unexpected.code, 'STARTUP_FAILURE');
  assert.ok(!JSON.stringify(unexpected).includes('PRIVATE_'));
});

test('configuration diagnostics show allowlisted field names, not invalid values', () => {
  try {
    readConfig({ PORT: 'PRIVATE_INVALID_PORT', MODEL_DIGEST: 'PRIVATE_INVALID_DIGEST' });
    assert.fail('Invalid configuration should throw.');
  } catch (error) {
    const event = startupFailure(error, 'configuration');
    assert.equal(event.code, 'INVALID_CONFIGURATION');
    assert.ok('fields' in event && event.fields?.includes('PORT'));
    assert.ok('fields' in event && event.fields?.includes('MODEL_DIGEST'));
    assert.ok(!JSON.stringify(event).includes('PRIVATE_'));
  }
});
