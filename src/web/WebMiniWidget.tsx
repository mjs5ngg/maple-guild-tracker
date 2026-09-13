// 공개 웹 데이터를 공유하는 Picture-in-Picture 및 화면 내 미니 위젯을 제공합니다.
import {useEffect,useMemo,useRef,useState,type PointerEvent as ReactPointerEvent} from "react";
import {createPortal} from "react-dom";
import {ChevronDown,Crown,Minus,PictureInPicture2,X} from "lucide-react";
import type {Snapshot} from "./types";
import {Avatar} from "./Avatar";
import {compact,sortRows,todayGain} from "./experience";

interface DocumentPictureInPictureApi{window:Window|null;requestWindow(options?:{width?:number;height?:number}):Promise<Window>}
declare global{interface Window{documentPictureInPicture?:DocumentPictureInPictureApi}}

type Mode="favorites"|"guild";type Basis="today"|"overall";
export const supportsDocumentPip=(target:Window=window)=>Boolean(target.documentPictureInPicture?.requestWindow);

export default function WebMiniWidget({guildRows,favoriteRows,primaryName,theme}:{guildRows:Snapshot[];favoriteRows:Snapshot[];primaryName:string;theme:string}){
 const [pip,setPip]=useState<Window|null>(null),[fallback,setFallback]=useState(false),[collapsed,setCollapsed]=useState(false),[mode,setMode]=useState<Mode>("favorites"),[basis,setBasis]=useState<Basis>("today"),[position,setPosition]=useState({x:Math.max(16,innerWidth-410),y:84});
 const drag=useRef<{x:number;y:number;left:number;top:number}|null>(null);
 const source=mode==="favorites"?favoriteRows:guildRows;
 const rows=useMemo(()=>basis==="overall"?sortRows(source,false,__EXP_TABLE__):[...source].sort((a,b)=>{const left=todayGain(a,__EXP_TABLE__),right=todayGain(b,__EXP_TABLE__);return left===right?sortRows([a,b],false,__EXP_TABLE__)[0]===a?-1:1:left===null?1:right===null?-1:left>right?-1:1;}),[source,basis]);
 useEffect(()=>{if(pip)pip.document.documentElement.dataset.theme=theme;},[pip,theme]);
 useEffect(()=>()=>{try{pip?.close();}catch{/* 이미 닫힌 창은 무시합니다. */}},[pip]);
 async function open(){
  if(!supportsDocumentPip()){setFallback(true);return;}
  let settled=false;const fallbackTimer=window.setTimeout(()=>{if(!settled)setFallback(true);},1200);
  try{const target=await window.documentPictureInPicture!.requestWindow({width:390,height:520});settled=true;clearTimeout(fallbackTimer);document.head.querySelectorAll("link[rel=stylesheet],style").forEach(node=>target.document.head.append(node.cloneNode(true)));target.document.documentElement.dataset.theme=theme;target.document.body.className="web-pip-body";target.addEventListener("pagehide",()=>setPip(null),{once:true});setPip(target);setFallback(false);}catch{settled=true;clearTimeout(fallbackTimer);setFallback(true);}
 }
 function startDrag(event:ReactPointerEvent){if(pip)return;drag.current={x:event.clientX,y:event.clientY,left:position.x,top:position.y};event.currentTarget.setPointerCapture(event.pointerId);}
 function moveDrag(event:ReactPointerEvent){if(!drag.current)return;setPosition({x:Math.max(0,Math.min(innerWidth-340,drag.current.left+event.clientX-drag.current.x)),y:Math.max(0,Math.min(innerHeight-100,drag.current.top+event.clientY-drag.current.y))});}
 const content=<section className={`web-mini-widget ${collapsed?"collapsed":""}`} aria-label="미니 위젯"><header onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={()=>drag.current=null}><div><b>{mode==="favorites"?"나 + 즐겨찾기":"길드 상위"}</b><small>{basis==="today"?"오늘 획득 순위":"전체 경험치 순위"}</small></div><button aria-label="접기" onClick={()=>setCollapsed(value=>!value)}>{collapsed?<ChevronDown/>:<Minus/>}</button><button aria-label="닫기" onClick={()=>{pip?.close();setPip(null);setFallback(false);}}><X/></button></header>{!collapsed&&<><div className="widget-controls"><button aria-pressed={mode==="favorites"} onClick={()=>setMode("favorites")}>나＋즐겨찾기</button><button aria-pressed={mode==="guild"} onClick={()=>setMode("guild")}>길드 상위</button></div><div className="widget-controls"><button aria-pressed={basis==="today"} onClick={()=>setBasis("today")}>오늘 획득</button><button aria-pressed={basis==="overall"} onClick={()=>setBasis("overall")}>전체 경험치</button></div><div className="widget-ranking">{rows.slice(0,20).map((row,index)=><article key={row.ocid}><i>{index+1}</i><Avatar character={row}/><span><b>{row.basic.character_name}{row.isHunting&&" 🔥"}</b><small>Lv.{row.basic.character_level} · {row.basic.character_exp_rate}%</small></span>{row.basic.character_name===primaryName&&<Crown className="widget-crown"/>}<strong>{basis==="today"?(todayGain(row,__EXP_TABLE__)===null?"자료 없음":`+${compact(todayGain(row,__EXP_TABLE__)!)}`):`${row.basic.character_exp_rate}%`}</strong></article>)}</div><footer>원본 탭을 닫거나 새로고침하면 위젯도 닫힙니다.</footer></>}</section>;
 const target=pip?.document.body;
 return <>{!pip&&<button className="widget-open-button" onClick={()=>void open()}><PictureInPicture2/>미니 위젯</button>}{target&&createPortal(content,target)}{fallback&&createPortal(<div className="web-widget-fallback" style={{left:position.x,top:position.y}}>{content}</div>,document.body)}</>;
}
