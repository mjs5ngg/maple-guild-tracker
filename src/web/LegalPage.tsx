// 공개 서비스의 개인정보 처리 및 이용 조건을 독립된 주소에서 안내합니다.
type LegalKind="privacy"|"terms";

export function legalKind(pathname:string):LegalKind|null{
 if(pathname==="/privacy")return "privacy";
 if(pathname==="/terms")return "terms";
 return null;
}

export default function LegalPage({kind}:{kind:LegalKind}){
 const privacy=kind==="privacy";
 return <main className="legal-page"><a className="brand" href="/"><span>🍁</span><b>길드원 따라가기</b></a><article className="surface"><span className="section-kicker">{privacy?"PRIVACY":"TERMS"}</span><h1>{privacy?"개인정보 처리 안내":"서비스 이용 안내"}</h1><p className="legal-updated">시행일 2026년 9월 15일.</p>{privacy?<>
  <h2>기기에만 저장하는 정보.</h2><p>NEXON Open API 서비스 키와 캐릭터의 현재·일별 경험치 기록은 개인 조회 전용 출처의 브라우저 저장소에 보관됩니다. 이 정보는 길드원 따라가기 서버, 광고 코드 또는 다른 이용자에게 전송하지 않습니다.</p>
  <h2>서버가 처리하는 정보.</h2><p>현재 신규 소셜 로그인은 중단되어 있습니다. 기존 로그인 이용자의 경우 Google 계정 식별자, 대표캐릭터명, 즐겨찾기명, 따라잡기 프리셋과 세션 토큰을 기기 간 설정 동기화 목적으로 처리할 수 있습니다. API 키와 경험치 기록은 계정 동기화 대상이 아닙니다.</p>
  <h2>보관과 삭제.</h2><p>로그아웃하면 브라우저 세션이 삭제되며, 계정 탈퇴를 실행하면 계정 설정과 프리셋이 삭제됩니다. 브라우저에서 사이트 데이터를 삭제하면 기기에 저장된 API 키와 경험치 기록도 삭제될 수 있습니다.</p>
  <h2>외부 서비스.</h2><p>캐릭터 정보 조회는 이용자 브라우저에서 NEXON Open API로 직접 전송됩니다. NEXON의 개인정보 및 API 이용 정책은 해당 서비스의 정책을 따릅니다.</p>
  <h2>광고와 쿠키.</h2><p>이용자가 광고를 허용한 경우에만 공개 대시보드가 카카오 AdFit을 불러옵니다. AdFit은 광고 제공과 성과 측정을 위해 쿠키와 접속 정보를 처리할 수 있으며, 푸터의 광고 설정에서 동의를 철회할 수 있습니다. 광고를 거부해도 서비스 기능은 제한되지 않습니다.</p>
  <h2>제휴 링크.</h2><p>추천 장비 영역에는 쿠팡 파트너스 또는 링크프라이스 제휴 링크가 포함될 수 있습니다. 링크를 통한 구매가 이루어지면 서비스 운영자가 수수료를 받을 수 있으며, 해당 영역에 경제적 이해관계를 표시합니다.</p>
 </>:<>
  <h2>서비스 성격.</h2><p>길드원 따라가기는 NEXON Open API 데이터를 기기에서 조회해 성장 기록을 계산하는 비공식 보조 서비스입니다. NEXON이 운영하거나 보증하는 서비스가 아닙니다.</p>
  <h2>데이터와 계산.</h2><p>API 지연, 점검, 날짜 경계와 경험치표 변경으로 값이 늦게 확정되거나 재정렬될 수 있습니다. 누락 자료는 0으로 추정하지 않으며 중요한 판단에는 공식 게임 정보를 함께 확인해야 합니다.</p>
  <h2>서비스 키.</h2><p>본인 명의의 서비스 단계 키만 입력하고 다른 사람과 공유하지 않아야 합니다. 이용자는 NEXON Open API 약관과 호출 한도를 준수할 책임이 있습니다.</p>
  <h2>광고와 제휴.</h2><p>공개 대시보드에는 서비스 운영을 위한 광고와 제휴 링크가 표시될 수 있습니다. 광고 동의 여부와 관계없이 조회·순위·그래프·따라잡기 기능은 동일하게 제공됩니다.</p>
  <h2>변경과 중단.</h2><p>안전한 운영, 외부 API 정책 변경 또는 장애 대응을 위해 기능을 변경하거나 일시 중단할 수 있습니다. 유료 자동 전환 없이 무료 인프라 한도 안에서 운영합니다.</p>
 </>}<footer><a href="/">서비스로 돌아가기</a><span>Data based on NEXON Open API</span></footer></article></main>;
}
