// Student records live in Upstash Redis as `student:<학번>` JSON values, indexed by the `students` set.
// Without Upstash credentials an in-memory store is used, only when ALLOW_MEMORY_STORE=1 (local tests).
import { Redis } from '@upstash/redis';

const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;

const mem = new Map();
const memFails = new Map();

export const hasStore = () => !!redis || process.env.ALLOW_MEMORY_STORE === '1';

export async function getStudent(sid) {
  if (redis) return (await redis.get('student:' + sid)) || null;
  return mem.has(sid) ? structuredClone(mem.get(sid)) : null;
}

export async function putStudent(s) {
  if (redis) {
    await redis.set('student:' + s.sid, s);
    await redis.sadd('students', s.sid);
  } else mem.set(s.sid, structuredClone(s));
}

export async function deleteStudent(sid) {
  if (redis) {
    await redis.del('student:' + sid);
    await redis.srem('students', sid);
  } else mem.delete(sid);
}

export async function allStudents() {
  if (!redis) return [...mem.values()].map((s) => structuredClone(s));
  const ids = await redis.smembers('students');
  const out = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const vals = await redis.mget(...chunk.map((id) => 'student:' + id));
    for (const v of vals) if (v) out.push(v);
  }
  return out;
}

// Failed-login counter with a 10-minute window.
const WINDOW = 600;
export async function failures(key) {
  if (redis) return Number((await redis.get('fail:' + key)) || 0);
  const f = memFails.get(key);
  return f && f.until > Date.now() ? f.n : 0;
}
export async function addFailure(key) {
  if (redis) {
    const n = await redis.incr('fail:' + key);
    if (n === 1) await redis.expire('fail:' + key, WINDOW);
    return n;
  }
  const f = memFails.get(key);
  const n = f && f.until > Date.now() ? f.n + 1 : 1;
  memFails.set(key, { n, until: f && n > 1 ? f.until : Date.now() + WINDOW * 1000 });
  return n;
}
export async function clearFailures(key) {
  if (redis) await redis.del('fail:' + key);
  else memFails.delete(key);
}
