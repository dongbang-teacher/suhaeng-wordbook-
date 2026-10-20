import { getStudent, putStudent, deleteStudent, allStudents, hasStore, failures, addFailure, clearFailures } from '../lib/store.js';
import {
  send, isSid, cleanName, INIT, newStudent, publicView, hashPin,
  teacherPasswordOk, teacherToken, isTeacher, hasTeacherPassword,
} from '../lib/common.js';

const MAX_FAILS = 20;

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST 요청만 받습니다.' });
  if (!hasStore()) return send(res, 503, { error: '저장소가 아직 연결되지 않았습니다. Vercel에서 Upstash Redis를 연결하세요.' });
  if (!hasTeacherPassword()) return send(res, 503, { error: '교사 비밀번호가 설정되지 않았습니다. Vercel 환경 변수 TEACHER_PASSWORD를 추가하세요.' });
  const b = req.body || {};
  try {
    if (b.action === 'login') {
      if ((await failures('teacher')) >= MAX_FAILS)
        return send(res, 429, { error: '실패가 많아 10분 동안 잠겼습니다.' });
      if (!teacherPasswordOk(b.password)) {
        await addFailure('teacher');
        return send(res, 401, { error: '교사 비밀번호가 틀렸습니다.' });
      }
      await clearFailures('teacher');
      return send(res, 200, { token: teacherToken() });
    }
    if (!isTeacher(req)) return send(res, 401, { error: '교사 로그인이 필요합니다.' });

    switch (b.action) {
      case 'list': {
        const list = (await allStudents()).map(publicView).sort((a, c) => a.sid.localeCompare(c.sid));
        return send(res, 200, { students: list });
      }
      case 'reset': {
        const s = isSid(b.sid) && (await getStudent(b.sid));
        if (!s) return send(res, 404, { error: '학생을 찾을 수 없습니다.' });
        s.pw = hashPin(s.sid, INIT);
        s.initialPw = true;
        await putStudent(s);
        await clearFailures('login:' + s.sid);
        return send(res, 200, { student: publicView(s) });
      }
      case 'delete': {
        if (!isSid(b.sid)) return send(res, 400, { error: '학번이 올바르지 않습니다.' });
        await deleteStudent(b.sid);
        return send(res, 200, { ok: true });
      }
      case 'roster': {
        const rows = Array.isArray(b.rows) ? b.rows.slice(0, 500) : [];
        let added = 0, skipped = 0, bad = 0;
        for (const r of rows) {
          const sid = r && r.sid, name = cleanName(r && r.name);
          if (!isSid(sid) || !name) { bad++; continue; }
          if (await getStudent(sid)) { skipped++; continue; }
          await putStudent(newStudent(sid, name));
          added++;
        }
        return send(res, 200, { added, skipped, bad });
      }
      default: return send(res, 400, { error: '알 수 없는 요청입니다.' });
    }
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: '서버 오류가 났습니다. 잠시 후 다시 시도하세요.' });
  }
}
