import { getStudent, putStudent, hasStore, failures, addFailure, clearFailures } from '../lib/store.js';
import {
  send, isSid, isPin, cleanName, INIT, newStudent, publicView, normWords,
  hashPin, studentToken, studentFrom,
} from '../lib/common.js';

const MAX_FAILS = 10;

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST 요청만 받습니다.' });
  if (!hasStore()) return send(res, 503, { error: '저장소가 아직 연결되지 않았습니다. 선생님께 알려 주세요.' });
  const b = req.body || {};
  try {
    switch (b.action) {
      case 'login': return await login(b, res);
      case 'me': {
        const s = await studentFrom(req);
        return s ? send(res, 200, { student: publicView(s) }) : send(res, 401, { error: '다시 로그인해 주세요.' });
      }
      case 'save': {
        const s = await studentFrom(req);
        if (!s) return send(res, 401, { error: '로그인이 끝났습니다. 다시 로그인한 뒤 저장하세요.' });
        s.words = normWords(b.words);
        s.updatedAt = new Date().toISOString();
        await putStudent(s);
        return send(res, 200, { student: publicView(s) });
      }
      case 'password': {
        const s = await studentFrom(req);
        if (!s) return send(res, 401, { error: '다시 로그인해 주세요.' });
        if (!isPin(b.newPin)) return send(res, 400, { error: '숫자 4자리로 입력하세요.' });
        if (b.newPin === INIT) return send(res, 400, { error: '0000은 초기 비밀번호라 사용할 수 없습니다.' });
        s.pw = hashPin(s.sid, b.newPin);
        s.initialPw = false;
        await putStudent(s);
        return send(res, 200, { token: studentToken(s), student: publicView(s) });
      }
      default: return send(res, 400, { error: '알 수 없는 요청입니다.' });
    }
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: '서버 오류가 났습니다. 잠시 후 다시 시도하세요.' });
  }
}

async function login(b, res) {
  const sid = b.sid, name = cleanName(b.name), pin = b.pin;
  if (!isSid(sid)) return send(res, 400, { error: '학번은 숫자 5자리입니다.' });
  if (!name) return send(res, 400, { error: '이름을 입력하세요.' });
  if (!isPin(pin)) return send(res, 400, { error: '비밀번호는 숫자 4자리입니다.' });
  const key = 'login:' + sid;
  if ((await failures(key)) >= MAX_FAILS)
    return send(res, 429, { error: '로그인 실패가 많아 10분 동안 잠겼습니다. 잠시 후 다시 하거나 선생님께 말씀하세요.' });

  let s = await getStudent(sid);
  if (!s) {
    if (pin !== INIT) return send(res, 400, { error: '처음 로그인할 때는 초기 비밀번호 0000을 입력하세요.' });
    s = newStudent(sid, name);
    await putStudent(s);
  } else if (s.name !== name) {
    await addFailure(key);
    return send(res, 401, { error: '학번과 이름이 맞지 않습니다. 다시 확인하세요.' });
  } else if (s.pw !== hashPin(sid, pin)) {
    await addFailure(key);
    return send(res, 401, { error: '비밀번호가 틀렸습니다. 기억나지 않으면 선생님께 초기화를 요청하세요.' });
  }
  await clearFailures(key);
  return send(res, 200, { token: studentToken(s), student: publicView(s), mustChange: pin === INIT });
}
