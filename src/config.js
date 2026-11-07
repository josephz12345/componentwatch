export const ORIGIN = 'https://vipoutlet.com';
export const COLLECTIONS = [
  'category-electronics-computers-computer-components',
  'category-electronics-computers-flashdrives-sd-storage-media',
];
function number(name, fallback, min, max) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer between ${min} and ${max}`);
  return value;
}
export function configuration() {
  const mode = process.argv.includes('--live') ? 'live' : process.env.MODE || 'demo';
  if (!['demo', 'live'].includes(mode)) throw new Error('MODE must be demo or live');
  return {
    mode, host: process.env.HOST || '127.0.0.1', port: number('PORT', 3000, 1, 65535),
    interval: number('SCAN_INTERVAL_MS', 5000, 5000, 3600000),
    retentionDays: number('RETENTION_DAYS', 90, 1, 3650),
    userAgent: process.env.USER_AGENT || 'ComponentWatch/1.0 (personal component price monitor)',
    dbPath: process.env.DB_PATH || `data/${mode}.sqlite`,
  };
}
