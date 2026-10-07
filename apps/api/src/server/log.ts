/**
 * Journaux JSON sur une ligne (lisibles par n'importe quel collecteur).
 * Les champs sensibles sont masqués AVANT écriture : jamais de code OTP, jeton ou mot de passe en clair,
 * et les numéros de téléphone sont tronqués.
 */
type Level = 'debug' | 'info' | 'warn' | 'error';
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const SECRET_KEYS = /pass(word)?|secret|token|authorization|cookie|otp|code_?hash|^code$|api_?key|database_?url/i;
const PHONE_KEYS = /phone|msisdn/i;

/** +22890123456 → +228•••••456 */
export function maskPhone(value: string): string {
  if (value.length <= 7) return '•••';
  return `${value.slice(0, 4)}${'•'.repeat(Math.max(3, value.length - 7))}${value.slice(-3)}`;
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[…]';
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (SECRET_KEYS.test(k)) out[k] = '[masqué]';
      else if (PHONE_KEYS.test(k) && typeof v === 'string') out[k] = maskPhone(v);
      else out[k] = redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

function threshold(): number {
  const lvl = (process.env.LOG_LEVEL ?? 'info') as Level;
  return order[lvl] ?? order.info;
}

function write(level: Level, msg: string, fields?: Record<string, unknown>) {
  if (order[level] < threshold()) return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...(redact(fields ?? {}) as object) });
  if (level === 'error' || level === 'warn') console.error(line);
  else console.log(line); // eslint-disable-line no-console
}

export const log = {
  debug: (msg: string, fields?: Record<string, unknown>) => write('debug', msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => write('info', msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => write('warn', msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => write('error', msg, fields),
};
