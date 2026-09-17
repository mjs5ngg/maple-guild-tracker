// NEXON Open API 오류 응답을 사용자에게 이해하기 쉬운 안내로 변환합니다.
export const NEXON_MAINTENANCE_MESSAGE="NEXON Open API 점검 중입니다. 기존 기록을 표시하며 점검 종료 후 자동으로 다시 확인합니다.";

export function nexonErrorMessage(body:string){
 try{
  const parsed=JSON.parse(body) as {error?:{name?:unknown}};
  if(parsed.error?.name==="OPENAPI00010")return NEXON_MAINTENANCE_MESSAGE;
 }catch{/* JSON이 아닌 오류 응답은 기존 일반 안내를 사용합니다. */}
 return "NEXON API 응답을 확인해 주세요.";
}
