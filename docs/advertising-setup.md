# 저조건 광고 운영 안내

`길드원 따라가기`의 첫 광고 공급자는 Advertica이며 일반 배너만 사용합니다. 팝업, 팝언더, 탭업, 탭언더, 리디렉트, 푸시, 파일 다운로드와 Direct Link는 사용하지 않습니다.

## 서비스 소유자가 해야 하는 절차

1. Advertica Publisher 계정을 만들고 이메일을 확인합니다. 이 단계는 완료됐습니다.
2. `Ad Tags`에서 `Banner Ads`를 선택합니다. Advertica는 태그가 실제 사이트에서 호출되면 사이트를 자동 연결하므로 별도 사이트 심사를 요청하지 않습니다.
3. 아래 크기의 광고 태그를 발급합니다.
   - 데스크톱 왼쪽 `160×600`.
   - 데스크톱 오른쪽 `160×600`.
   - 데스크톱 하단 `728×90`.
   - 모바일 하단 `320×50`.
4. Placement name은 각각 `guildmate_desktop_left`, `guildmate_desktop_right`, `guildmate_bottom_desktop`, `guildmate_bottom_mobile`로 정합니다.
5. 확장 필터에서는 성인·도박·다운로드·오해 유도 소재를 차단합니다. 수익 극대화보다 일반 서비스 화면의 안전성을 우선합니다.
6. 생성된 HTML 태그 전체를 UTF-8 Base64로 바꿔 `.env.monetization`에 넣습니다. 이 파일은 Git에 올리지 않습니다.
7. `powershell -ExecutionPolicy Bypass -File scripts/deploy-edge.ps1`을 실행합니다.

```dotenv
WEB_AD_HOST_ORIGIN=https://ads.guildfollow.com
WEB_ADVERTICA_DESKTOP_LEFT_TAG_B64=
WEB_ADVERTICA_DESKTOP_RIGHT_TAG_B64=
WEB_ADVERTICA_DESKTOP_BOTTOM_TAG_B64=
WEB_ADVERTICA_MOBILE_BOTTOM_TAG_B64=
WEB_AFFILIATE_CARDS_JSON=[]
```

PowerShell에서 태그를 Base64로 바꾸려면 태그를 클립보드에 복사한 뒤 아래 명령을 실행합니다. 출력값만 해당 항목에 넣습니다.

```powershell
[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes((Get-Clipboard -Raw)))
```

광고 태그가 하나도 없으면 광고 슬롯과 고정 광고용 여백이 모두 숨겨집니다. 광고 태그가 설정되면 별도 동의창 없이 격리된 광고 전용 iframe을 불러오며, 개인정보 안내에서 광고 공급자와 브라우저 차단 방법을 고지합니다.

## 격리 경계

- 광고 사업자 코드는 `https://ads.guildfollow.com`에서만 실행됩니다.
- 공개 대시보드는 크기와 준비 상태만 전달받고 광고 태그를 포함하지 않습니다.
- 개인 NEXON 서비스 키 화면에는 광고 출처나 광고 코드가 포함되지 않습니다.
- 광고 차단 또는 로드 실패 시 광고 슬롯을 숨기며 핵심 기능은 계속 동작합니다.
- 광고 노출과 클릭은 D1에 저장하지 않습니다.
