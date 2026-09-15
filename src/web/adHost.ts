// Advertica 배너 태그를 민감한 대시보드와 분리된 광고 전용 출처에서 실행합니다.
type Placement="desktopLeft"|"desktopRight"|"desktopBottom"|"mobileBottom";

const allowed=new Set<Placement>(["desktopLeft","desktopRight","desktopBottom","mobileBottom"]);
const placement=new URLSearchParams(location.search).get("placement") as Placement|null;
const notify=(type:"ad-ready"|"ad-error")=>parent.postMessage({type,placement},__DASHBOARD_ORIGIN__);
if(!placement||!allowed.has(placement)||!__ADVERTICA__[placement])notify("ad-error");
else{
 const unit=__ADVERTICA__[placement]!;
 document.documentElement.style.cssText=`width:${unit.width}px;height:${unit.height}px;overflow:hidden;background:transparent`;
 document.body.style.cssText="margin:0;overflow:hidden;background:transparent";
 const template=document.createElement("template");template.innerHTML=unit.html;document.body.append(template.content.cloneNode(true));
 const scripts=[...document.body.querySelectorAll("script")];let pending=scripts.filter(script=>Boolean(script.src)).length,failed=false;
 const ready=()=>{if(!failed&&pending===0)notify("ad-ready");};
 for(const source of scripts){const script=document.createElement("script");for(const attribute of source.attributes)script.setAttribute(attribute.name,attribute.value);script.textContent=source.textContent;if(source.src){script.addEventListener("load",()=>{pending-=1;ready();},{once:true});script.addEventListener("error",()=>{failed=true;notify("ad-error");},{once:true});}source.replaceWith(script);}
 requestAnimationFrame(ready);
}
