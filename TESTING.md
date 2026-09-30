# 검증 기록 · 2026-09-30 KST

## 판정

v0.1.1 초기 환경 처리 업데이트: Side Panel 시작 시 availability 자동 확인, 공식 4개 상태의 한국어 표시, 사용자 버튼에서 모델 준비/다운로드 시작, 진행률 100% 이후 로딩 상태를 추가했습니다. 기본 Prompt API에 수동 flags를 요구하지 않는다는 점은 2026-09-30 공식 문서로 재확인했습니다.

**설치 가능한 PoC 구현은 제공하지만 1단계 전체 성공은 아직 확인되지 않았습니다.** 실제 Built-in AI 추론 성공과 로그인된 Jira 결과 검증이 남았습니다. 테스트 더블은 데이터 흐름 확인에만 사용했습니다.

실행환경: Linux 컨테이너, Chrome for Testing **151.0.7922.34**, RAM 약 **9.7GiB**, 사용자 브라우저 연결에서 확인한 탭은 `about:blank` 1개. 인증 정보·Jira API Token은 사용하지 않았습니다.

## 실제 브라우저에서 확인한 항목

| 항목 | 결과 / 범위 |
| --- | --- |
| MV3 로딩 | 임시 Chrome 프로필에서 확장 로딩 성공 |
| Side Panel | Extension 문서 초기화와 사용자 gesture에서 `chrome.sidePanel.open()` 성공. Headless 환경이므로 Chrome의 실제 도킹된 UI 최종 확인은 사용자 PC에서 필요 |
| 기본 프리셋 | 일반 / Jira / 개발 문서 / 오류·장애 4개 표시 |
| 기술 문서 fixture | 233자, source 9개, 제약·deprecated·링크·heading 보존 |
| 긴 일반 페이지 fixture | 13,962자, source 146개, 마지막 구간까지 보존 |
| Jira fixture | 306자, source 9개, 제목·설명·댓글 2개·첨부 이미지 1개 감지 |
| 숨김 / navigation 제외 | hidden·display:none·opacity:0 본문, 테스트 navigation 제외 확인 |
| 선택 영역 | 선택 텍스트와 원문 selector 유지 |
| 이미지 픽셀 | 동일 출처 600px 테스트 이미지 canvas 읽기 성공 |
| CORS | cross-origin 이미지의 SecurityError와 명시적 실패 이유 확인 |
| 사용자 프리셋 | 저장 → 확장 문서 reload → 유지 → 수정 → 삭제 성공 |
| AI 상태 UI | `텍스트: unavailable / 이미지: unavailable` 표시 |
| 분석 오류 UI | 수집 원문 유지하면서 AI unavailable 오류 표시 |
| 한글 레이아웃 | 420px 폭 문서 캡처에서 입력·버튼·오류·수집 카드 확인 |
| JS 예외 | 통합 테스트에서 uncaught Side Panel 오류 없음 |

범용 수집을 더 확인하기 위해 실제 공개 웹페이지도 시도했습니다.

| 페이지 | 직접 접속 | 인증서를 검증해 내려받은 HTML의 로컬 브라우저 수집 |
| --- | --- | --- |
| Chrome Prompt API 공식 문서 | 테스트 Chrome의 `ERR_CERT_AUTHORITY_INVALID`로 차단 | 21,431자 / source 198개 / heading 24개 / 수집 상한 미도달 |
| Wikipedia ChromeOS 긴 문서 | 동일한 인증서 오류로 차단 | 82,430자 / source 505개 / heading 42개 / 수집 상한 미도달 |

브라우저 인증서 검증을 해제하지 않았습니다. 두 HTML은 다운로드 단계에서 인증서를 검증한 후 로컬에서 렌더링했으며, 실제 라이브 사이트의 스크립트·외부 자원 전체 동작까지 검증한 것은 아닙니다. 해당 사이트 원문 HTML은 배포 ZIP에 포함하지 않습니다.

통합 테스트의 임시 확장 복사본에는 자동화용 loopback/public-test host 권한을 추가했습니다. **배포 manifest에는 이 권한이 없습니다.** 배포본의 `activeTab` 부여 동작 및 실제 사용자 Chrome 설치는 아래 체크리스트로 확인해야 합니다.

## 실제 Chrome AI 호출 시도

```json
{
  "apiPresent": true,
  "textAvailability": "unavailable",
  "imageAvailability": "unavailable",
  "createAttempt": {
    "name": "NotSupportedError",
    "message": "Unable to create a text session because the service is not running."
  }
}
```

공식 문서는 이미지 modality를 지원하지만 이 실행환경의 모델 서비스는 실행되지 않았습니다. RAM은 공식 CPU 경로 요구사항 16GB보다 적습니다. 다만 위 오류만으로 부족한 RAM이 유일한 원인이라고 단정하지 않습니다. 모델 다운로드 진행·실제 streaming·실제 JSON Schema 출력·이미지 추론 성공·한국어 처리 품질은 이 환경에서 확인하지 못했습니다. API를 강제로 통과시키는 flag, 외부 AI 대체, 가짜 분석 결과는 적용하지 않았습니다.

`tests/browser-results.json`의 `REAL Chrome Built-in AI capability and call attempt`는 **blocked**입니다. `TEST DOUBLE` 항목은 사용자 질문 전달, Jira 스키마 적용, source reference 보존, 이미지 스키마의 처리 흐름만 확인한 것이며 실제 AI 성공이 아닙니다.

## 1단계 성공 조건별 현재 상태

| 번호 | 성공 조건 | 현재 상태 |
| --- | --- | --- |
| 1 | 설치 가능 | 임시 테스트 복사본 로딩 확인 / 배포본 사용자 설치 확인 필요 |
| 2 | Side Panel 실행 | 문서와 open API 확인 / native 도킹 UI 확인 필요 |
| 3 | 현재 페이지 텍스트 | fixture 3종 + 실제 공개 HTML 2종 확인 |
| 4 | Built-in AI 호출 성공 | **미확인 — 서비스 unavailable** |
| 5 | 일반 프리셋 실제 분석 | **미확인** / 프롬프트·처리 흐름만 테스트 |
| 6 | Jira 프리셋 실제 분석 | **미확인** / Jira fixture 및 처리 흐름만 테스트 |
| 7 | 사용자 질문 | UI 입력 및 분석 프롬프트 전달 확인 |
| 8 | 사용자 정의 프리셋 | 저장·선택·reload 유지·수정·삭제 확인 |
| 9 | 이미지 지원 실제 검사 | 해당 옵션 availability 검사 완료 — unavailable |
| 10 | 이미지 최소 1개 실제 추론 | **미확인** / 픽셀 읽기만 실제 성공 |
| 11 | 진행 상태 | 수집·모델·오류 상태 확인 / 실제 모델 streaming 진행 미확인 |
| 12 | 분석 오류 | 실제 unavailable 및 CORS 오류 처리 확인 |
| 13 | 크기 비교 | 수집 문자 수 실제 표시 / 결과 크기 산출은 테스트 더블·단위 테스트 확인 |
| 14 | Jira 아닌 페이지 | 수집 확인 / 실제 AI 추론은 미확인 |

## 사용자 Chrome 최종 확인 체크리스트

### 설치와 권한

- [ ] ZIP을 풀고 `manifest.json` 폴더를 Chrome 개발자 모드에서 로드한다.
- [ ] 일반 페이지의 확장 아이콘을 클릭해 도킹된 Side Panel을 연다.
- [ ] 다른 탭에서도 확장 아이콘을 다시 클릭하면 수집이 가능하다.
- [ ] 자동 수집이 없고 버튼을 눌렀을 때만 수집한다.
- [ ] 오류가 나면 Chrome 버전, AI 상태, 오류 이름/메시지를 기록한다.

### 실제 모델

- [ ] 공식 하드웨어·디스크·네트워크 조건을 확인한다.
- [ ] `AI 상태 확인`에서 텍스트와 이미지 상태를 각각 기록한다.
- [ ] 다운로드가 필요하면 `모델 준비 / 다운로드`를 눌러 실제 진행률과 완료를 확인한다.
- [ ] 영어 문서 + 영어 질문 + English 결과로 최초 텍스트 추론을 확인한다.
- [ ] 일반 프리셋과 개발 문서 프리셋에서 실제 결과의 필드와 내용이 달라지는지 확인한다.
- [ ] 질문을 `Find only documented constraints.`로 변경해 질문이 결과에 반영되는지 확인한다.
- [ ] 입력이 너무 크면 선택 영역 분석으로 재시도한다.
- [ ] 분석 중 취소 후 다시 실행이 가능한지 확인한다.

### Jira

- [ ] 로그인한 Jira 이슈에서 설명·중요 댓글·첨부를 직접 펼치고 로딩한다.
- [ ] 수집 원문에서 제목과 설명, 필요한 댓글의 실제 텍스트를 확인한다.
- [ ] 감지된 댓글 개수와 현재 화면에 로드된 댓글 개수를 비교한다. 총 댓글 수라고 간주하지 않는다.
- [ ] 첨부 이미지 ID/src/alt/파일명이 존재하는지 확인한다.
- [ ] Jira 프리셋 결과에 중요 댓글과 이미지 근거가 포함되는지 확인한다.
- [ ] source 버튼이 실제 원문 위치로 이동하는지 확인한다.
- [ ] 한글 Jira와 한국어 결과 옵션의 품질·미지원 오류를 별도로 기록한다.

### 이미지

- [ ] 이미지 capability가 `available`이면 실제 pixel 기반 결과의 visibleTexts / observations / uncertain을 확인한다.
- [ ] 최소 한 이미지에서 화면 글자와 AI가 판독한 글자가 일치하는지 비교한다.
- [ ] CORS 차단 시 이유를 확인하고 필요하면 viewport 캡처 옵션으로 보이는 화면만 다시 확인한다.
- [ ] 이미지 미지원·실패·생략을 성공한 이미지 내용으로 오인하지 않는지 확인한다.
- [ ] screenshot에서 DB 원인·백엔드 데이터 존재가 확인된 사실로 단정되지 않는지 확인한다.

## 개발 테스트

단위 테스트 **11개 통과**: 기존 9개에 공식 4개 상태의 한국어 매핑, 읽기 전용 probe와 사용자 prepare의 다운로드·로딩·ready 전이를 추가했습니다. 다운로드 이벤트 테스트는 테스트 더블이며 실제 모델 다운로드 성공을 의미하지 않습니다.

원본 자동화 결과는 `tests/browser-results.json`, 실제 UI 캡처는 `tests/sidepanel-verified.png`입니다. 테스트 fixture는 업무 개인정보가 없는 합성 자료이며 현재 Jira UI의 모든 DOM을 재현하지 않습니다.
