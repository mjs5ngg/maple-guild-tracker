// 제3자 배너 스크립트를 민감한 대시보드와 분리된 광고 전용 출처에서 실행합니다.
type Placement="desktopLeft"|"desktopRight"|"desktopBottom"|"mobileBottom";

const allowed=new Set<Placement>(["desktopLeft","desktopRight","desktopBottom","mobileBottom"]);
const placement=new URLSearchParams(location.search).get("placement") as Placement|null;
const notify=(type:"ad-ready"|"ad-error")=>parent.postMessage({type,placement},__DASHBOARD_ORIGIN__);
if(!placement||!allowed.has(placement)||!__ADSTERRA__[placement])notify("ad-error");
else{
 const unit=__ADSTERRA__[placement]!;
 document.documentElement.style.cssText=`width:${unit.width}px;height:${unit.height}px;overflow:hidden;background:transparent`;
 document.body.style.cssText="margin:0;overflow:hidden;background:transparent";
 window.atOptions={key:unit.key,format:"iframe",height:unit.height,width:unit.width,params:{}};
 const script=document.createElement("script");script.async=true;script.src=unit.scriptUrl;script.onload=()=>notify("ad-ready");script.onerror=()=>notify("ad-error");document.body.append(script);
}
