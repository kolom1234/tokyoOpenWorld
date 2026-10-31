// `pnpm killswitch <status|ensure|on|off> [--target production|staging-test] [--confirm-production]`(ADR-0104): 비용 차단 WAF 규칙 수동 조작.
// 재활성화(차단 해제)는 자동으로 하지 않는다 — 원인 확인 뒤 `pnpm killswitch off`(docs/13 §6 킬 스위치 절차). production 켜기는 `--confirm-production` 필요.
// 토큰 = CF_KILLSWITCH_TOKEN(존 한정 Zone → WAF: Edit + Zone → Zone: Read), 선택 CF_ZONE_ID. 값은 출력하지 않는다.
import { parseArgs } from 'node:util';
import { apiFromEnv, ensure, setEnabled, status, TARGETS, type Target } from './lib/killswitch.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    target: { type: 'string', default: 'production' },
    'confirm-production': { type: 'boolean', default: false },
  },
});
const cmd = positionals[0] ?? 'status';
const target = values.target as Target;
if (!(target in TARGETS)) throw new Error(`--target must be ${Object.keys(TARGETS).join(' | ')}`);
const api = apiFromEnv();
if (!api) throw new Error('CF_KILLSWITCH_TOKEN is not set (zone token: Zone → WAF: Edit + Zone → Zone: Read)');

const show = async (): Promise<void> => {
  for (const [t, s] of Object.entries(await status(api))) {
    const state = s.exists
      ? `${s.enabled ? 'ENABLED (blocking)' : 'disabled'}${s.customResponse ? '' : ' · default 403 page'}`
      : 'missing';
    process.stdout.write(`${t.padEnd(13)} ${TARGETS[t as Target].host.padEnd(24)} ${state}\n`);
  }
};

if (cmd === 'status') await show();
else if (cmd === 'ensure') {
  const created = await ensure(api);
  process.stdout.write(`created (disabled): ${created.join(', ') || 'none'}\n`);
  await show();
} else if (cmd === 'on' || cmd === 'off') {
  if (cmd === 'on' && target === 'production' && !values['confirm-production'])
    throw new Error(
      'turning the production kill switch on blocks earthaimap.com /api and /world — add --confirm-production',
    );
  const changed = await setEnabled(api, target, cmd === 'on');
  process.stdout.write(`${target}: ${cmd}${changed ? '' : ' (already)'}\n`);
  await show();
} else throw new Error(`unknown command ${cmd} (status | ensure | on | off)`);
