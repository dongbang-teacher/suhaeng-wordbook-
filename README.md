# 2학기 수행평가 단어장

학생이 서론·본론·결론 단어를 15개씩 입력하고, 교사가 학생별·반별·전체로 조회하고 엑셀로 내려받는 앱입니다.

- `public/` — 화면 (index.html, app.js)
- `api/student.js` — 학생 로그인, 단어 저장, 비밀번호 변경
- `api/teacher.js` — 교사 로그인, 조회, 비밀번호 초기화, 삭제, 명단 등록
- `lib/` — 저장소(Upstash Redis)와 공통 함수

## Vercel 설정

1. Vercel에서 이 GitHub 저장소를 Import 합니다. (Framework Preset: Other)
2. Settings → Environment Variables에 `TEACHER_PASSWORD`를 추가합니다.
3. Storage 탭에서 Upstash for Redis를 만들어 이 프로젝트에 연결합니다.
   (`KV_REST_API_URL`, `KV_REST_API_TOKEN` 환경 변수가 자동으로 생깁니다.)
4. Deployments에서 Redeploy를 눌러 환경 변수를 적용합니다.

학번 5자리: 1번째 = 학년, 2·3번째 = 반, 4·5번째 = 번호 (예: 11021 → 10반 21번)
