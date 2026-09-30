# Current Page Lens · Chrome Extension PoC

현재 페이지에서 로드된 텍스트와 이미지 근거를 수집하고 Chrome의 로컬 모델로 분석하는 Manifest V3 확장입니다. 특정 사이트 분석 로직, 외부 AI API, MCP, Codex 연동은 없습니다.

**구현과 브라우저 기능 검증은 완료했지만 1단계 전체 성공 판정은 보류입니다.** 테스트용 Chrome에서 LanguageModel API는 노출되었으나 실제 모델 상태가 `unavailable`이어서 추론 성공과 출력 품질은 확인하지 못했습니다. 로그인된 Jira 실페이지도 제공된 브라우저에 없었습니다. 상세 기록은 [검증 기록](TESTING.md)과 `tests/browser-results.json`을 확인하세요. 테스트 더블 결과를 실제 AI 성공으로 집계하지 않았습니다.

## 설치 (빌드 / npm 설치 불필요)

1. GitHub 저장소의 **Code → Download ZIP**으로 받거나 clone합니다. 압축 해제 후 `manifest.json`이 있는 프로젝트 폴더를 확인하세요.
2. 데스크톱 Chrome에서 `chrome://extensions`를 엽니다.
3. **개발자 모드**를 켭니다.
4. **압축해제된 확장 프로그램을 로드합니다**를 누르고 `manifest.json`이 있는 프로젝트 폴더를 선택합니다.
5. 확장 아이콘을 고정합니다.
6. 분석할 일반 웹페이지에서 확장 아이콘을 클릭합니다. Side Panel이 열리고 해당 탭에 `activeTab` 권한이 부여됩니다. 단축키 기본값은 `Alt+Shift+A`입니다. 충돌하면 `chrome://extensions/shortcuts`에서 변경하세요.

다른 탭으로 이동하거나 다른 origin으로 이동한 뒤에는 **그 탭에서 확장 아이콘을 다시 클릭**하세요. 패널이 계속 열려 있다는 것만으로 새 탭의 수집 권한이 생기지는 않습니다. `chrome://`, Chrome Web Store, 다른 확장 페이지, 내장 PDF 뷰어는 수집 대상이 아닙니다. `file://`은 확장 설정의 파일 URL 접근 허용이 별도로 필요합니다.

## 최초 실행

### 초기 환경 처리 · v0.1.1 추가

Side Panel을 열면 텍스트/이미지 옵션별 `LanguageModel.availability()`를 자동 호출하며 **바로 사용 가능 / 로컬 모델 다운로드 필요 / 모델 다운로드 중 / 현재 환경에서 사용 불가**를 표시합니다. 이 확인은 읽기 전용이며 페이지 수집이나 모델 다운로드를 자동으로 시작하지 않습니다.

다운로드가 필요한 상태에서 사용자가 **모델 준비 / 다운로드** 또는 **현재 페이지 분석**을 누르면 공식 `LanguageModel.create()`가 준비와 다운로드를 시작합니다. `downloadprogress`로 진행률을 표시하며 100% 이후에는 모델 로딩 중으로 안내하고 `create()`가 완료된 뒤에만 바로 사용 가능으로 변경합니다. 설치 직후 사용자 동작 없이 강제로 다운로드하지 않습니다. 공식 API의 사용자 활성화 조건에 맞춘 흐름입니다.

2026-09-30에 공식 Prompt API 문서를 다시 확인했습니다. 기본 Extension Prompt API 사용에서 `chrome://flags` 수동 설정을 전제로 하지 않습니다. API 미노출/사용 불가가 발생해도 임의의 실험 flag를 켜도록 안내하지 않으며 Chrome 버전·하드웨어·디스크·브라우저 정책 확인을 안내합니다.

1. 먼저 영어 기술 문서를 열고 확장 아이콘을 클릭합니다. Side Panel에서 AI 상태를 자동 확인합니다. 필요하면 **AI 상태 확인**으로 다시 검사합니다.
2. `available`이면 모델이 준비되어 있습니다. `downloadable` / `downloading`이면 **모델 준비 / 다운로드**를 직접 눌러 진행률을 확인합니다. 다운로드는 Chrome에서 처리합니다.
3. 일반 페이지 분석 프리셋을 선택하고 질문에 `What are the confirmed facts and constraints?`를 입력합니다. 결과 언어는 `English · 공식 지원`으로 둡니다.
4. **현재 페이지 분석**을 누릅니다. 수집 원문, 이미지 메타데이터, 모델 상태, 진행 상황, 분석 결과, 크기 비교가 표시됩니다.
5. 결과의 `source-N` 버튼은 **수집 당시 탭**의 원문 위치로 이동하고 강조합니다. 페이지가 이동하거나 DOM이 변경되면 이동 실패를 표시합니다.
6. **JSON 저장**은 사용자가 요청할 때만 로컬 파일을 내려받습니다. URL과 원문 근거가 포함되므로 업무 결과를 공유할 때 내용을 직접 확인하세요.

`unavailable`이나 API 없음이 표시되어도 텍스트 수집 결과는 확인할 수 있습니다. 화면의 오류 메시지를 임의의 성공 결과로 대체하지 않습니다.

## 공식 Chrome API 확인 · 2026-09-30 KST

공식 출처:

- [Prompt API](https://developer.chrome.com/docs/ai/prompt-api) — 확인한 페이지의 마지막 수정일: 2026-08-26.
- [Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel).
- [Chrome Built-in AI](https://developer.chrome.com/docs/ai/built-in).

| 확인 항목 | 공식 문서 기준 / 구현 |
| --- | --- |
| API 이름 | `LanguageModel`; 과거 `chrome.aiOriginTrial` / `ai.languageModel` 예제 사용하지 않음 |
| 확장 지원 | Prompt API는 Extensions Chrome 138부터. manifest 최소 버전 138 |
| Side Panel | MV3 Chrome 114부터. 이 프로젝트는 Prompt API에 맞춰 138 이상 |
| 실행 context | Extension 문서인 Side Panel에서 호출. Web Worker 미지원이므로 Service Worker에서 AI 호출하지 않음 |
| Availability | `LanguageModel.availability(options)`: `available`, `downloadable`, `downloading`, `unavailable`. API 미노출은 별도 상태 |
| 다운로드 | 사용자 클릭에서 `LanguageModel.create()` 호출, `monitor`의 `downloadprogress` 이벤트로 상태 표시 |
| Streaming | `session.promptStreaming()` 지원. JSON이 완성되기 전에는 생성 문자 수를 표시 |
| 구조화 출력 | `responseConstraint`에 JSON Schema 전달; 생성 결과를 추가 검증 |
| 이미지 | `expectedInputs`의 `image`, prompt content의 `{type:'image', value:Blob}`. 해당 옵션으로 availability와 실제 호출을 별도 확인 |
| 모델 언어 | 공식 문서에 명시된 언어: en, ja, es, de, fr. **한국어는 공식 지원 목록 밖** |
| Flag / origin trial | 현재 공식 문서의 기본 Extension Prompt API에 별도 flag나 origin-trial 권한을 요구하지 않음. 만료된 `aiLanguageModelOriginTrial` 권한 사용하지 않음. 이미지 가능 여부는 버전만으로 가정하지 않고 런타임 검사 |
| Sampling | 이 PoC는 실험 sampling 옵션을 사용하지 않음 |

공식 하드웨어 조건은 Windows 10/11, macOS 13+, Linux 또는 지원 Chromebook Plus이며 모바일은 대상이 아닙니다. 프로필 볼륨의 여유 공간 22GB 이상이 필요합니다. GPU는 VRAM **4GB 초과**, CPU 경로는 RAM **16GB 이상 + CPU 4코어 이상**입니다. 최초 모델 다운로드에는 무제한/비종량제 네트워크가 필요하며 이후 추론은 로컬입니다. 여유 공간이 10GB 미만으로 떨어지면 모델이 제거될 수 있습니다. 설치된 모델 세부 사항은 `chrome://on-device-internals`에서 확인할 수 있습니다. 이 조건 충족만으로 모든 환경에서 availability를 보장하지는 않습니다.

한국어 UI는 지원하지만 한국어 페이지·질문·출력의 모델 처리 품질은 별개입니다. 한국어 결과를 선택하면 실험 경고를 유지합니다. 지원되지 않는 `languages:['ko']`를 선언하거나 영어로 자동 번역했다고 가장하지 않습니다. 업무 Jira의 한글 처리 품질은 사용자 PC에서 반드시 확인해야 합니다.

## 구조

```text
content/extractor.js               범용 DOM 수집, 원문 reference, 이미지 픽셀 읽기
content/site-extractors/jira.js     선택적인 제목/설명/댓글/첨부 랜드마크 식별
ai/prompts.js                      프리셋, 증거 규칙, JSON Schema
ai/analyzer.js                     availability, 모델 세션, 이미지 추론, 텍스트 구간 분석
presets/preset-store.js             사용자 프리셋 chrome.storage.local CRUD
core/page-service.js               탭 수집·이미지 캡처·원문 위치 이동
core/analyze-current-page.js        UI와 무관한 분석 오케스트레이션
sidepanel/                         컨트롤, 진행 상태, 결과 렌더링
service-worker.js                  Side Panel 열기 설정만 수행
```

Jira 전용 분석기는 없습니다. Jira 랜드마크는 데이터의 `kind`와 댓글 감지 개수만 보강하며 분석은 선택한 Prompt Preset이 결정합니다. 랜드마크를 찾지 못해도 범용 본문 수집으로 진행합니다. Jira 페이지가 아니어도 Jira 프리셋을 선택할 수 있지만 프롬프트에서 Jira 데이터가 있다고 가정하지 않도록 지시합니다.

## 독립 호출 인터페이스

아래는 **Extension 문서**에서 사용할 수 있는 예입니다. Node/MCP 프로세스에서 현재 그대로 실행하는 인터페이스가 아닙니다.

```js
import { ChromeAIEngine } from './ai/analyzer.js';
import { analyzeCurrentPage } from './core/analyze-current-page.js';

const engine = new ChromeAIEngine();
// 모델 생성은 사용자 클릭 핸들러에서 시작해야 합니다.
await engine.prepare({ images: true, onProgress: consoleStatusOnly });
const report = await analyzeCurrentPage({
  presetId: 'jira',
  userPrompt: 'Find confirmed facts and evidence for missing results.',
  engine,
  includeImages: true,
  includeViewport: false,
  outputLanguage: 'en',
  onProgress: consoleStatusOnly
});
// report는 UI와 독립된 JSON-serializable 객체입니다.
// 원문/이미지 데이터는 console에 출력하지 마세요.
engine.dispose();
```

`analyzePageData({page,preset,userPrompt,engine,...})`는 Chrome 탭 수집과도 분리되어 있습니다. 향후 MCP transport, 요청 인증, 탭 선택, 사용자 동의 및 모델 다운로드 활성화는 별도 계층으로 추가해야 합니다. 이번 버전은 외부 메시지 listener, native messaging, localhost 수신 서버를 설치하지 않습니다.

반환 값은 `page`, `preset`, `userPrompt`, `ai`, `result`, `imageResults`, `sources`, `images`, `stats`, `limitations`, `notes`를 포함합니다. Jira 결과는 `requirements`, `confirmedFacts`, `observations`, `importantEvidence`, `unknowns`, `searchKeywords` 배열로 구성되며 배열 항목은 `{text,sourceIds,invalidSourceIds?}`입니다. 원문은 수집 순간 URL·CSS selector·텍스트와 연결됩니다. 없는 source ID가 생성되면 제거하면서 `invalidSourceIds` 경고를 남깁니다. ID 존재 검증은 AI 주장과 실제 원문의 일치까지 증명하지 않으므로 중요한 사실은 원문 버튼으로 확인해야 합니다.

## 프리셋

- 일반 페이지 분석: 핵심 내용 / 사실 / 세부 정보 / 관찰 / 불확실성 / 근거.
- Jira 이슈 분석: 요구사항 / 사실 / 관찰 / 중요 근거 / 확인 필요 / 후속 검색 키워드.
- 개발 문서 분석: 개념 / API / 사용 방법 / 제약 / 예제 / 주의 / deprecated·호환성 / 질문 관련 구간.
- 오류/장애 분석: 증상 / 오류 메시지 / 사실 / 관찰 / 가능 원인 / 추가 확인 / 문서상 조치.
- 사용자 정의: 이름과 프롬프트를 저장·수정·삭제·선택합니다. 사용자 프리셋은 일반 분석 JSON 필드 형식을 유지합니다. 기본 프리셋과 system 증거 규칙은 변경하지 않습니다.

질문이 프리셋 방향보다 우선하지만, 페이지/이미지에 없는 내용은 Unknown으로 남기도록 지시합니다. 페이지 본문에 들어 있는 AI 지시문은 실행 명령이 아니라 불신 데이터로 취급합니다. 추론 정확성이나 prompt injection 완전 방어를 보장하지는 않습니다.

## 수집 범위 / 크기

- URL, document title, 현재 로드된 주요 본문, heading, 링크, 선택 텍스트, 버튼·label 등 UI 텍스트, 이미지 메타데이터를 수집합니다.
- `main` / `article` / `[role=main]` 중 본문 길이가 가장 큰 영역을 우선 사용하며 없으면 body를 사용합니다.
- 스크립트/스타일, 숨긴 요소, navigation, 비밀번호 입력을 제외합니다. 텍스트 노드를 의미 블록으로 묶어 중첩 `innerText` 반복 수집을 피합니다.
- 일반 중복 텍스트는 제거하되 중복 위치 최대 12곳을 해당 source에 유지합니다. 댓글·설명은 동일 내용이어도 위치별로 유지합니다.
- `rawChars`: body의 렌더링된 `innerText` 문자 수입니다. HTML 전체 길이나 최초 서버 원문의 길이가 아닙니다.
- `collectedChars`: 정제·중복 제거 후 원문 source 텍스트 합계입니다.
- `analyzedTextChars`: 실제 선택한 분석 대상 텍스트 합계입니다.
- `analysisInputChars`: 프롬프트·원문·메타데이터·이미지 분석 지시문을 합한 **전체 호출의 입력 문자열 합계**입니다. 이미지 픽셀/토큰은 제외합니다. 메타데이터 반복으로 원본보다 커질 수 있으며 토큰 절감률로 해석하면 안 됩니다.
- `resultChars`: 병합된 분석 결과 JSON 문자 수이며 source 원문이나 이미지 결과 전체를 포함한 내보내기 파일 크기가 아닙니다.
- 수집 한도는 본문 180,000자 / source 1,800개 / 이미지 메타데이터 80개입니다. 상한 도달 시 명시적으로 누락을 표시합니다.
- 본문은 최대 6,500자 단위로 나누고 큰 source는 동일 ID + part로 분할합니다. 모든 수집 구간을 독립 세션 clone에서 분석하고 결과를 JSON으로 병합합니다. **구간을 넘나드는 종합 추론은 구현하지 않았습니다.**
- heading 처음 40개와 링크 처음 30개는 각 분석 입력에 사용합니다. 전체 수집 heading/링크는 반환 JSON에 남습니다.
- `measureContextUsage`가 노출된 환경에서는 입력이 contextWindow의 70%를 초과하면 설명과 함께 중단합니다. 무음으로 앞부분을 버리지 않습니다. 좁은 모델/큰 메타데이터에서 실패하면 선택 영역 분석을 사용하세요.

접힌 내용·미로드 댓글·가상 스크롤로 제거된 행·iframe·closed shadow DOM·CSS 배경 이미지·canvas 본문은 자동으로 펼치거나 수집하지 않습니다. 필요한 댓글과 이미지를 직접 펼치고 로딩한 뒤 분석하세요. 원문과 이미지 캡처는 정지된 DOM의 원자적 스냅샷이 아니므로 실시간 업데이트 페이지에서는 수집 중 바뀔 수 있습니다.

## 이미지

1. 이미지 ID, src, alt, 파일명, 크기, 주변 텍스트, 위치를 유지합니다.
2. 이미지 availability를 텍스트와 별도로 확인합니다. 지원된다고 가정하지 않습니다.
3. 작은 아이콘은 제외하고 큰 이미지부터 최대 4개를 현재 페이지 canvas에서 읽습니다. 긴 변이 1,600px를 넘으면 축소합니다. 페이지에 이미 로드된 픽셀을 읽으며 새 이미지 URL을 fetch하지 않습니다.
4. 픽셀을 읽었고 이미지 모델 세션이 실제로 준비된 경우에만 이미지 prompt를 호출합니다. 출력은 `{id,visibleTexts,observations,uncertain,status}`입니다. OCR 결과는 AI 판독이므로 원본과 비교하세요.
5. CORS, 미로드, DOM 변경, 작은 크기, 개수 한도, 모델 미지원, 모델 호출 실패는 각 이미지에 이유를 유지합니다. alt/파일명으로 화면 내용을 봤다고 주장하지 않습니다.
6. **현재 보이는 화면도 캡처**는 기본 해제입니다. 사용자가 선택하면 `captureVisibleTab`으로 현재 viewport를 한 장 더 분석합니다. 크로스오리진 이미지를 포함할 수 있으나 페이지 밖/스크롤 밖의 이미지 개별 내용은 보장하지 않습니다. 브라우저 toolbar를 포함하는 전체 데스크톱 스크린샷이 아닙니다.

공식 문서의 이미지 지원과 이 실행환경의 이미지 추론 성공은 서로 다른 사항입니다. 이번 실제 테스트에서는 `image=unavailable`이며 이미지 추론은 성공 확인하지 못했습니다. 동일 출처 이미지 픽셀 읽기와 CORS 오류 기록은 확인했습니다.

향후 확장은 optional origin permissions를 사용한 명시적 이미지 가져오기, 사용자 첨부 파일 입력, iframe/가상 스크롤 별도 수집 등을 검토할 수 있습니다. 이번 버전은 광범위한 host permissions를 추가하거나 외부 OCR/AI를 사용하지 않습니다.

## 보안 / 보관

권한은 `activeTab`, `scripting`, `storage`, `sidePanel`만 사용합니다. 배포 manifest에는 `host_permissions`, 자동 content_scripts, tabs 권한, 외부 메시지 접근이 없습니다. Service Worker는 페이지를 읽지 않습니다.

Extension 문서는 CSP `connect-src 'none'`으로 네트워크 연결을 차단합니다. 픽셀 data URL은 네트워크 fetch 대신 직접 Blob으로 변환합니다. 페이지/이미지를 외부 AI·서버에 전송하는 코드가 없습니다. Chrome 자체의 모델 다운로드는 별개이며 브라우저가 수행합니다.

원문 전체와 이미지 base64를 console에 기록하지 않습니다. 프리셋만 `chrome.storage.local`에 저장하고 페이지 원문/결과는 패널 메모리에 유지합니다. 모델 세션은 패널 종료 또는 취소 때 해제됩니다. 수집은 분석 버튼에서만 시작합니다. 질문/프리셋은 분석 중에도 수정할 수 있으며 실행 시작 시의 값을 해당 실행에 사용합니다.

## 테스트 실행

설치에는 개발 도구가 필요 없습니다. 자동화 테스트를 재실행하는 경우 Node.js 20+와 Playwright/Chrome for Testing이 필요합니다.

```bash
npm test
# Playwright가 설치된 테스트 환경에서:
CPA_CHROME=/absolute/path/to/chrome npm run test:browser
```

Windows PowerShell에서는 `$env:CPA_CHROME = 'C:\path\chrome.exe'`로 지정한 후 `npm run test:browser`를 실행하세요. 테스트는 임시 프로필/임시 확장 복사본을 사용합니다. 테스트 복사본에만 fixture/public-test host 권한을 추가하고 종료 시 제거합니다. 배포 manifest를 변경하지 않습니다. `--no-sandbox`는 격리된 Linux 컨테이너 테스트용 실행 옵션이며 사용자의 일반 Chrome 설정을 변경하지 않습니다.

`tests/fixtures`는 개인정보 없는 테스트 자료입니다. `tests/browser-results.json`은 자동화 결과, `tests/sidepanel-verified.png`는 실제 확장 문서 캡처입니다. 실제 사용자 PC의 모델 실행과 Jira DOM 변화에 대한 최종 확인은 [검증 체크리스트](TESTING.md)를 따라 진행하세요.
