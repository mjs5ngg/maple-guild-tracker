// 공개 웹 출처와 개인 키 출처의 분리 및 서버 주소 일치를 검사합니다.
export function webOrigins(env:Record<string,string|undefined>){
 const dashboard=env.WEB_DASHBOARD_ORIGIN||env.PUBLIC_ORIGIN||"http://127.0.0.1:3100";
 const direct=env.WEB_DIRECT_ORIGIN||"http://127.0.0.1:3101";
 const parse=(value:string)=>{
  let url:URL;
  try{url=new URL(value);}catch{throw new Error("웹 출처 URL 설정을 확인하세요.");}
  if(url.origin!==value||url.username||url.password)throw new Error("웹 출처에는 경로·인증 정보를 넣을 수 없습니다.");
  const local=["localhost","127.0.0.1","[::1]"].includes(url.hostname);
  if(url.protocol!=="https:"&&!(local&&url.protocol==="http:"))throw new Error("공개 웹 출처는 HTTPS가 필요합니다.");
  return {url,local};
 };
 const a=parse(dashboard),b=parse(direct);
 if(a.url.origin===b.url.origin)throw new Error("개인 키 화면은 별도 출처가 필요합니다.");
 if(env.PUBLIC_ORIGIN&&env.PUBLIC_ORIGIN!==dashboard)throw new Error("PUBLIC_ORIGIN과 WEB_DASHBOARD_ORIGIN이 일치해야 합니다.");
 if(a.local!==b.local)throw new Error("공개 대시보드와 개인 조회 화면의 공개 출처를 함께 지정하세요.");
 return {dashboardOrigin:dashboard,directOrigin:direct};
}
