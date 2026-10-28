'use strict';

// Public protocol-shaped demonstration data. Production Hub aggregation and
// provider parsing stay in the upstream repository; the Android client only
// consumes their normalized output.
function ollamaProvider() {
  return {
    provider: 'ollama', status: 'ok', sourceDeviceId: 'workstation',
    windows: [
      { kind: 'billing', metric: 'credits', label: 'Included credits',
        remaining: 52.5, used: 7.5, limit: 60, usedPercent: 12.5, showMeter: true, currency: 'USD' },
      { kind: 'billing', metric: 'credits', label: 'Credit balance', remaining: 18.25,
        currency: 'USD', showMeter: false, resetDescription: 'Refills to $30 in 3 weeks.' },
      { kind: 'billing', metric: 'spend', label: 'Monthly credits used', used: 4.5,
        currency: 'USD', showMeter: false },
    ],
  };
}

function accountStats() {
  const updatedAt = new Date().toISOString();
  const claude = organization => ({ provider: 'claude', accountKey: `sha256:${organization}`,
    accountEmail: 'viewer@example.com', accountName: organization, status: 'ok', updatedAt,
    windows: [{ kind: 'session', usedPercent: 25 }] });
  const muse = () => ({ provider: 'muse', status: 'ok', updatedAt,
    windows: [{ kind: 'session', usedPercent: 0 }, { kind: 'weekly', usedPercent: 80 }] });
  const workstation = { deviceId: 'workstation', hostname: 'Development', updatedAt,
    periods: { today: { totalTokens: 100 } },
    limits: { providers: [claude('one'), claude('two'), muse(), ollamaProvider()] } };
  const laptop = { deviceId: 'laptop', hostname: 'Development', updatedAt,
    periods: { today: { totalTokens: 200 } }, limits: { providers: [claude('one'), muse()] } };
  return {
    devices: [workstation, laptop], periods: { today: { totalTokens: 300 } },
    limits: { providers: [claude('one'), claude('two'),
      { ...workstation.limits.providers[2], sourceDeviceId: 'workstation' },
      { ...laptop.limits.providers[1], sourceDeviceId: 'laptop' }, ollamaProvider()] },
  };
}

module.exports = { ollamaProvider, accountStats };
