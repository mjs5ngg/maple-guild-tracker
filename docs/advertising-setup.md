# 저조건 광고 운영 안내

`길드원 따라가기`의 첫 광고 공급자는 Adsterra이며 일반 디스플레이 배너만 사용합니다. 팝언더, 푸시, 인터스티셜, Social Bar, SmartLink는 사용하지 않습니다.

## 서비스 소유자가 해야 하는 절차

1. Adsterra에서 Publisher 계정을 만들고 이메일을 확인합니다.
2. 사이트 주소로 `https://app.guildmate.workers.dev`를 등록합니다.
3. Boost CPM처럼 광고 유형을 넓히는 선택지는 끄고 Display Banner만 선택합니다.
4. 아래 크기의 광고 단위를 발급합니다.
   - 데스크톱 왼쪽 `160×600`.
   - 데스크톱 오른쪽 `160×600`.
   - 데스크톱 하단 `728×90`.
   - 모바일 하단 `320×50`.
5. 각 코드에서 `atOptions.key`와 `invoke.js` 전체 HTTPS 주소를 `.env.monetization`에 넣습니다. 이 파일은 Git에 올리지 않습니다.
6. `powershell -ExecutionPolicy Bypass -File scripts/deploy-edge.ps1`을 실행합니다.

```dotenv
WEB_AD_HOST_ORIGIN=https://maple-exp-ads.pages.dev
WEB_ADSTERRA_DESKTOP_LEFT_KEY=
WEB_ADSTERRA_DESKTOP_LEFT_SCRIPT_URL=
WEB_ADSTERRA_DESKTOP_RIGHT_KEY=
WEB_ADSTERRA_DESKTOP_RIGHT_SCRIPT_URL=
WEB_ADSTERRA_DESKTOP_BOTTOM_KEY=
WEB_ADSTERRA_DESKTOP_BOTTOM_SCRIPT_URL=
WEB_ADSTERRA_MOBILE_BOTTOM_KEY=
WEB_ADSTERRA_MOBILE_BOTTOM_SCRIPT_URL=
WEB_AFFILIATE_CARDS_JSON=[]
```

광고 키가 하나도 없으면 광고 동의창, 광고 슬롯, 빈 여백이 모두 숨겨집니다. 광고가 설정되어도 사용자가 동의하기 전에는 광고 전용 iframe을 만들지 않습니다.

## 격리 경계

- 광고 사업자 코드는 `https://maple-exp-ads.pages.dev`에서만 실행됩니다.
- 공개 대시보드는 크기와 준비 상태만 전달받고 광고 키를 포함하지 않습니다.
- 개인 NEXON 서비스 키 화면에는 광고 출처나 광고 코드가 포함되지 않습니다.
- 광고 차단 또는 로드 실패 시 광고 슬롯을 숨기며 핵심 기능은 계속 동작합니다.
- 광고 노출과 클릭은 D1에 저장하지 않습니다.
