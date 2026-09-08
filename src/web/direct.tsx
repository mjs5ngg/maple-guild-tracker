// 개인 키를 별도 출처에 저장하고 넥슨으로만 직접 전송합니다.
import {useEffect,useRef,useState} from "react";
import {createRoot} from "react-dom/client";
import {parseNexon} from "./experience";
import type {Basic,Snapshot} from "./types";
import "./web.css";
import {readPersonal,writePersonal} from "./personalStorage";
const KEY="maple-personal-key",KIND="maple-personal-kind";
function App(){
 const [key,setKey]=useState(()=>readPersonal(KEY)||""),[remember,setRemember]=useState(()=>!!readPersonal(KEY));
 const [kind,setKind]=useState(readPersonal(KIND)==="service"?"service":"development"),[primary,setPrimary]=useState(""),[names,setNames]=useState<string[]>([]);
 const [storageWarning,setStorageWarning]=useState("");
 const nextRefresh=useRef(0);
 const [message,setMessage]=useState("대시보드 연결을 기다립니다."),[busy,setBusy]=useState(false),[count,setCount]=useState(0);
 useEffect(()=>{
 const receive=(event:MessageEvent)=>{
 if(event.origin!==__DASHBOARD_ORIGIN__||event.source!==window.opener||event.data?.type!=="maple-targets")return;
 if(typeof event.data.primary!=="string"||!Array.isArray(event.data.names))return;
 setPrimary(event.data.primary);setNames([...new Set<string>(event.data.names.filter((n:unknown)=>typeof n==="string"&&n.length<=40))].slice(0,1000));setMessage("키는 이 화면에서 넥슨으로만 전송됩니다.");
 };
 window.addEventListener("message",receive);
 window.opener?.postMessage({type:"maple-ready"},__DASHBOARD_ORIGIN__);
 return()=>window.removeEventListener("message",receive);
 },[]);
 async function request(path:string,params:Record<string,string>):Promise<any>{
 for(let attempt=0;attempt<4;attempt++){
 await new Promise(r=>setTimeout(r,250));
 const url=new URL("https://open.api.nexon.com/maplestory/v1/"+path);url.search=new URLSearchParams(params).toString();
 const response=await fetch(url,{headers:{"x-nxopen-api-key":key.trim()},credentials:"omit",referrerPolicy:"no-referrer",signal:AbortSignal.timeout(20000)});
 if(response.ok)return parseNexon(await response.text());
 if(response.status===429&&attempt<3){await new Promise(r=>setTimeout(r,700*2**attempt+Math.random()*300));continue;}
 throw new Error(response.status===429?"호출 한도에 도달했습니다.":"키 또는 API 응답을 확인해 주세요.");
 }
 throw new Error("재시도 횟수를 초과했습니다.");
 }
 async function refresh(){
 if(navigator.locks){await navigator.locks.request("maple-personal-refresh",{ifAvailable:true},async lock=>{if(lock)await executeRefresh();else setMessage("다른 창에서 조회 중입니다.");});}
 else await executeRefresh();
 }
 async function executeRefresh(){
 if(busy||!primary||!key.trim())return;
 const until=Math.max(nextRefresh.current,Number(readPersonal("maple-next-refresh"))||0);
 if(Date.now()<until){setMessage("연속 조회 방지를 위해 잠시 기다려 주세요.");return;}
 setBusy(true);setCount(0);
 try{
 const saved=writePersonal(KEY,remember?key.trim():null);
 setStorageWarning(saved?"":"브라우저 저장 또는 삭제가 차단됐습니다. 이번 조회는 가능하지만, 기존 저장 키 삭제는 브라우저 사이트 데이터 설정에서 확인하세요.");
 writePersonal(KIND,kind);
 let targets=kind==="development"?[primary]:[...new Set([primary,...names])];
 if(kind==="service"){
 const id=await request("id",{character_name:primary});
 const basic:Basic=await request("character/basic",{ocid:id.ocid});
 if(basic.character_guild_name){
 const guild=await request("guild/id",{guild_name:basic.character_guild_name,world_name:basic.world_name});
 const list=await request("guild/basic",{oguild_id:guild.oguild_id});
 if(!Array.isArray(list.guild_member))throw new Error("길드 명단 조회 실패");
 targets=[...new Set([...targets,...list.guild_member.filter((v:unknown)=>typeof v==="string")])] as string[];
 }
 }
 const rows:Snapshot[]=[];let failed=0;
 for(const name of targets){
 try{const id=await request("id",{character_name:name});const basic:Basic=await request("character/basic",{ocid:id.ocid});rows.push({ocid:id.ocid,basic,observedAt:new Date().toISOString(),history:[]});}
 catch{failed++;}
 setCount(rows.length+failed);await new Promise(r=>setTimeout(r,500));
 }
 window.opener?.postMessage({type:"maple-results",rows},__DASHBOARD_ORIGIN__);
 setMessage("조회 완료 "+rows.length+"명 · 실패 "+failed+"명. 결과는 개인 화면에만 반영됩니다.");
 }catch{setMessage("저장 또는 조회에 실패했습니다. 브라우저 저장 권한과 네트워크를 확인하세요.");}
 finally{nextRefresh.current=Date.now()+60000;writePersonal("maple-next-refresh",String(nextRefresh.current));setBusy(false);}
 }
 return <main><header><h1>개인 새로고침</h1></header><section className="panel"><p>대표캐릭터 <strong>{primary||"연결 대기"}</strong></p><form onSubmit={e=>{e.preventDefault();void refresh();}}>
 <label>넥슨 API 키<input name="password" type="password" autoComplete="current-password" value={key} onChange={e=>setKey(e.target.value)}/></label>
 <label>발급받은 키 종류<select value={kind} onChange={e=>setKind(e.target.value)}><option value="development">개발키 · 대표캐릭터만</option><option value="service">서비스키 · 모든 등록 캐릭터</option></select></label>
 <p className="muted">개발키는 초당 5건·하루 1,000건, 서비스키는 초당 500건·하루 2,000만 건입니다. 한도는 애플리케이션별 합산이며, 대표만 조회하는 것은 이 서비스의 정책입니다.</p>
 <label className="check"><input type="checkbox" checked={remember} onChange={e=>{setRemember(e.target.checked);if(!e.target.checked&&!writePersonal(KEY,null))setStorageWarning("저장 키 삭제가 차단됐습니다. 브라우저 사이트 데이터 설정에서 삭제하세요.");}}/>이 브라우저에 키 기억하기</label><p className="muted">공용 기기에서는 저장하지 마세요. 브라우저 저장소와 확장 프로그램을 통한 노출 가능성은 남습니다.</p>
 {storageWarning&&<p role="alert">{storageWarning}</p>}
 <div className="actions"><button disabled={busy||!primary||!key.trim()}>{busy?count+"명 조회 중…":"최신 정보 조회"}</button><button type="button" onClick={()=>{setStorageWarning(writePersonal(KEY,null)?"":"저장 키 삭제가 차단됐습니다. 브라우저 사이트 데이터 설정에서 삭제하세요.");setKey("");setRemember(false);}}>저장된 키 삭제</button></div></form><p role="status">{message}</p><a href="https://openapi.nexon.com/ko/guide/prepare-in-advance/" target="_blank" rel="noreferrer">API 발급 안내</a></section><footer>Data based on NEXON Open API</footer></main>;
}
createRoot(document.getElementById("root")!).render(<App/>);
