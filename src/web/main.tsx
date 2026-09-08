// 공용 수집 기록과 개인 조회 결과를 분리하여 표시하는 웹 대시보드입니다.
import {useEffect,useState} from "react";
import {createRoot} from "react-dom/client";
import type {Snapshot} from "./types";
import {compact,parseNexon,sortRows,todayGain,dailyPoints,periodGain} from "./experience";
import {ResponsiveContainer,LineChart,Line,XAxis,YAxis,Tooltip,CartesianGrid} from "recharts";
import "./web.css";
import {registerStatusTool} from "./webmcp";
import {syncStatusText} from "./syncStatus";
async function api(path:string,body?:unknown){
 const response=await fetch(path,{method:body===undefined?"GET":"POST",headers:body===undefined?{}:{"Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)});
 const data= parseNexon(await response.text()) as Record<string,any>;
 if(!response.ok)throw new Error(data.error||"요청 실패");return data;
}
function App(){
 useEffect(registerStatusTool,[]);
 const [status,setStatus]=useState<any>(null),[me,setMe]=useState<any>(null),[error,setError]=useState("");
 const [primary,setPrimary]=useState(""),[favorites,setFavorites]=useState(""),[rows,setRows]=useState<Snapshot[]>([]);
 const [personal,setPersonal]=useState<Snapshot[]>([]),[period,setPeriod]=useState(localStorage.getItem("web-ranking")!=="total");
 const [scope,setScope]=useState("guild"),[sync,setSync]=useState<any>(null);
 const [days,setDays]=useState(Number(localStorage.getItem("web-days"))===7?7:Number(localStorage.getItem("web-days"))===30?30:1);
 async function load(){try{const data=await api("/api/dashboard");setRows(data.characters);setSync(data.sync);}catch(e){setError(String(e));}}
 useEffect(()=>{
 let loggedIn=false;
 void api("/api/status").then(setStatus).catch(e=>setError(String(e)));
 void api("/api/me").then(data=>{loggedIn=true;setMe(data);setPrimary(data.primary);setFavorites(data.favorites.join("\n"));void api("/api/activity",{});void load();}).catch(()=>{});
 const timer=setInterval(()=>{if(loggedIn&&document.visibilityState==="visible")void load();},60000);
 const active=()=>{if(loggedIn&&document.visibilityState==="visible"){void api("/api/activity",{}).catch(()=>{});void load();}};
 let lastAction=0;const action=()=>{if(loggedIn&&Date.now()-lastAction>60000){lastAction=Date.now();void api("/api/activity",{}).catch(()=>{});}};
 document.addEventListener("pointerdown",action);document.addEventListener("keydown",action);
 document.addEventListener("visibilitychange",active);
 return()=>{clearInterval(timer);document.removeEventListener("visibilitychange",active);document.removeEventListener("pointerdown",action);document.removeEventListener("keydown",action);};
 },[]);
 async function save(){try{setError("");const names=favorites.split(/[\n,]/).map(v=>v.trim()).filter(Boolean);await api("/api/profile",{primary:primary.trim(),favorites:names});setMe({primary:primary.trim(),favorites:names});await load();}catch(e){setError(String(e));}}
 function refresh(){
 if(!me?.primary){setError("대표캐릭터를 먼저 저장하세요.");return;}
 const popup=window.open(__DIRECT_ORIGIN__,"maple-personal","width=620,height=800");
 if(!popup){setError("개인 조회 창의 팝업을 허용해 주세요.");return;}
 const names=[...new Set([me.primary,...me.favorites,...rows.map(r=>r.basic.character_name)])];
 const receive=(event:MessageEvent)=>{
 if(event.origin!==__DIRECT_ORIGIN__||event.source!==popup)return;
 if(event.data?.type==="maple-ready")popup.postMessage({type:"maple-targets",primary:me.primary,names},__DIRECT_ORIGIN__);
 if(event.data?.type==="maple-results"&&Array.isArray(event.data.rows)){
 const valid=event.data.rows.slice(0,1000).filter((r:any)=>r&&typeof r.basic?.character_name==="string"&&typeof r.ocid==="string"&&Number.isInteger(r.basic.character_level)&&/^\d+$/.test(String(r.basic.character_exp))&&Number.isFinite(Date.parse(r.observedAt)));
 setPersonal(valid.map((r:Snapshot)=>{const old=rows.find(s=>s.ocid===r.ocid);return {...r,history:old?.history||[],todayBaseline:old?.todayBaseline,estimated:old?.estimated};}));
 void api("/api/activity",{}).catch(()=>{});window.removeEventListener("message",receive);
 }
 };
 window.addEventListener("message",receive);
 setTimeout(()=>window.removeEventListener("message",receive),15*60*1000);
 }
 const merged=rows.map(row=>personal.find(p=>p.ocid===row.ocid&&p.observedAt>row.observedAt)||row);
 for(const row of personal)if(!merged.some(r=>r.ocid===row.ocid))merged.push(row);
 const primaryRow=merged.find(r=>r.basic.character_name===me?.primary);
 const visible=sortRows(merged.filter(r=>scope==="favorites"?(r.basic.character_name===me?.primary||me?.favorites.includes(r.basic.character_name)):(r.basic.character_name===me?.primary||!!primaryRow?.basic.character_guild_name&&r.basic.character_guild_name===primaryRow.basic.character_guild_name&&r.basic.world_name===primaryRow.basic.world_name)),false,__EXP_TABLE__);
 if(period)visible.sort((a,b)=>{const x=periodGain(a,days,__EXP_TABLE__).value,y=periodGain(b,days,__EXP_TABLE__).value;return x===y?0:x===null?1:y===null?-1:x>y?-1:1;});
 const points=primaryRow?dailyPoints(primaryRow,days,__EXP_TABLE__).map(p=>({date:p.date.slice(5),xp:p.value===null?null:Number(p.value)/1e12})):[];
 return <main>
 <header><div><span className="eyebrow">길드원 따라가기 · 비공식 서비스</span><h1>메이플 EXP 트래커</h1></div><span className="badge">15분 자동 수집</span><select aria-label="기간" value={days} onChange={e=>{setDays(Number(e.target.value));localStorage.setItem("web-days",e.target.value);}}><option value="1">오늘</option><option value="7">오늘 포함 7일</option><option value="30">오늘 포함 30일</option></select></header>
 {error&&<p role="alert" className="error">{error}</p>}
 {!status?<p>서버 연결 중…</p>:<section className="status">저장소 {status.database?"연결됨":"설정 필요"} · 자동 수집 {status.collector?"설정됨":"설정 필요"}</section>}
 {!me?<section className="panel"><h2>로그인</h2><p>대표캐릭터와 즐겨찾기를 기기 간 함께 사용합니다.</p><div className="actions">{status?.providers.map((p:any)=><button key={p.name} disabled={!p.configured||!status.database} onClick={()=>location.href="/auth/"+p.name+"/start"}>{p.name} {p.configured?"로그인":"설정 대기"}</button>)}</div><p className="muted">실제 로그인은 개발자 앱 등록 후 연결됩니다. 넥슨 계정 비밀번호는 받지 않습니다.</p></section>:<>
 <section className="panel"><div className="actions"><h2>캐릭터 설정</h2><button onClick={()=>void api("/api/logout",{}).then(()=>location.reload())}>로그아웃</button></div><label>대표캐릭터<input value={primary} onChange={e=>setPrimary(e.target.value)} maxLength={20}/></label><label>즐겨찾기 · 최대 30명<textarea value={favorites} onChange={e=>setFavorites(e.target.value)} placeholder="한 줄에 한 캐릭터"/></label><button onClick={()=>void save()}>설정 저장</button><p className="muted">마지막 이용 후 168시간이 지나면 필요 대상 수집이 중단됩니다. 다른 활성 사용자가 필요한 캐릭터는 계속 수집합니다.</p><div className="actions">{status?.providers.map((p:any)=><button key={p.name} disabled={!p.configured} onClick={()=>location.href="/auth/"+p.name+"/start?link=1"}>{p.name} 계정 연결</button>)}</div></section>
 <section className="panel"><div className="actions"><h2>{scope==="guild"?"캐릭터":"즐겨찾기"} 순위</h2><button onClick={()=>setScope(scope==="guild"?"favorites":"guild")}>{scope==="guild"?"즐겨찾기 보기":"전체 보기"}</button><button onClick={()=>{setPeriod(!period);localStorage.setItem("web-ranking",period?"total":"today");}}>{period?"기간별 경험치":"전체 경험치"}</button><button onClick={refresh}>개인 키로 새로고침 ↗</button></div>
 <p className="muted">서버 {syncStatusText(sync)} · 개인 조회는 공용 기록에 반영되지 않습니다.</p>
 {visible.length===0?<p className="empty">아직 수집된 자료가 없습니다. 대표캐릭터를 저장하면 다음 수집 주기에 조회합니다.</p>:<div className="tablewrap"><table><thead><tr><th>순위</th><th>캐릭터</th><th>레벨</th><th>현재 경험치</th><th>{period?days+"일 동안 획득":"오늘 획득"}</th><th>조회 기준</th></tr></thead><tbody>{visible.map((r,i)=><tr key={r.ocid}><td>{i+1}</td><td>{r.basic.character_name===me.primary?"♛ ":""}{r.basic.character_name}<small>{r.basic.character_class}</small></td><td>{r.basic.character_level}</td><td>{r.basic.character_exp_rate}%</td><td>{compact(period?periodGain(r,days,__EXP_TABLE__).value:todayGain(r,__EXP_TABLE__))}{period&&!periodGain(r,days,__EXP_TABLE__).complete?<small>일부 수집</small>:r.estimated?<small>추정</small>:null}</td><td>{personal.includes(r)?"개인":"서버"} {new Date(r.observedAt).toLocaleTimeString("ko-KR",{hour12:false})}</td></tr>)}</tbody></table></div>}
 </section><section className="panel"><h2>대표캐릭터 성장 흐름 · {days}일</h2>{primaryRow?<ResponsiveContainer width="100%" height={250}><LineChart data={points}><CartesianGrid stroke="#303947"/><XAxis dataKey="date"/><YAxis unit="조"/><Tooltip/><Line dataKey="xp" name="획득 경험치(조)" stroke="#ffac67" connectNulls={false} dot type="linear"/></LineChart></ResponsiveContainer>:<p>자료 수집 후 표시됩니다.</p>}</section></>}
 <details className="panel"><summary>데이터 및 이용 안내</summary><p>자정 근처 획득량은 API 제공 시점에 따라 날짜 경계에 오차가 생길 수 있으며, 오전 2시 이후 공식 기록을 확보하면 보정될 수 있습니다. 기준 자료가 없는 값은 0이 아니라 자료 없음으로 표시합니다.</p><p>개인 조회는 최신 정보만 조회하며 완료 후 1분간 재호출을 제한합니다. 웹·앱 이용 또는 수동 갱신으로 이용 기간을 연장합니다. 자동 요청만으로는 연장되지 않습니다.</p></details>
 <footer>Data based on NEXON Open API</footer></main>;
}
createRoot(document.getElementById("root")!).render(<App/>);
