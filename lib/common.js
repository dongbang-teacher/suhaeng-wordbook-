import crypto from 'node:crypto';
import { getStudent } from './store.js';

export const N = 15;
export const KEYS = ['intro', 'body', 'concl'];
export const INIT = '0000';
const TTL = 12 * 60 * 60 * 1000; // 로그인 유지 12시간

const SECRET =
  process.env.SESSION_SECRET ||
  process.env.UPSTASH_REDIS_REST_TOKEN ||
  process.env.KV_REST_API_TOKEN ||
  'local-dev-secret';
// Set TEACHER_PASSWORD in Vercel → Settings → Environment Variables; it is never stored in the code.
const TEACHER_PW = process.env.TEACHER_PASSWORD || '';
export const hasTeacherPassword = () => TEACHER_PW.length > 0;

export function send(res, status, body) {
  res.status(status).setHeader('Cache-Control', 'no-store');
  res.json(body);
}

export const isSid = (v) => typeof v === 'string' && /^\d{5}$/.test(v);
export const isPin = (v) => typeof v === 'string' && /^\d{4}$/.test(v);
export const cleanName = (v) => (typeof v === 'string' ? v.replace(/\s+/g, '').slice(0, 10) : '');

export function blank() {
  return { intro: Array(N).fill(''), body: Array(N).fill(''), concl: Array(N).fill('') };
}
export function normWords(w) {
  const out = blank();
  for (const k of KEYS) {
    const a = (w && Array.isArray(w[k]) && w[k]) || [];
    for (let i = 0; i < N; i++) out[k][i] = typeof a[i] === 'string' ? a[i].trim().slice(0, 20) : '';
  }
  return out;
}

export function newStudent(sid, name) {
  return {
    sid, name,
    pw: hashPin(sid, INIT), initialPw: true,
    words: blank(),
    createdAt: new Date().toISOString(), updatedAt: null,
  };
}
// What the browser may see: everything except the password hash.
export function publicView(s) {
  const { pw, ...rest } = s;
  return { ...rest, words: normWords(s.words) };
}

export function hashPin(sid, pin) {
  return crypto.scryptSync(String(pin), 'suhaeng-2026-2:' + sid, 32).toString('hex');
}

const mac = (s) => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');
function safeEq(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
const bearer = (req) => {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : '';
};

// Student token is tied to the current password hash, so a reset or change logs old sessions out.
export function studentToken(s) {
  const exp = Date.now() + TTL;
  return `s.${s.sid}.${exp}.${mac(`s:${s.sid}:${exp}:${s.pw}`)}`;
}
export async function studentFrom(req) {
  const m = /^s\.(\d{5})\.(\d+)\.([\w-]+)$/.exec(bearer(req));
  if (!m || Number(m[2]) < Date.now()) return null;
  const s = await getStudent(m[1]);
  if (!s || !safeEq(m[3], mac(`s:${m[1]}:${m[2]}:${s.pw}`))) return null;
  return s;
}

export const teacherPasswordOk = (p) => hasTeacherPassword() && safeEq(p || '', TEACHER_PW);
export function teacherToken() {
  const exp = Date.now() + TTL;
  return `t.${exp}.${mac(`t:${exp}:${TEACHER_PW}`)}`;
}
export function isTeacher(req) {
  const m = /^t\.(\d+)\.([\w-]+)$/.exec(bearer(req));
  return !!m && hasTeacherPassword() && Number(m[1]) >= Date.now() && safeEq(m[2], mac(`t:${m[1]}:${TEACHER_PW}`));
}
