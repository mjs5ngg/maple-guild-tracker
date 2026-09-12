// 공용 기록과 개인 조회를 대표 요약·순위·성장 패널 중심으로 제공하는 웹 대시보드입니다.
import {lazy,Suspense,useEffect,useMemo,useRef,useState} from "react";
import {createRoot} from "react-dom/client";
import {QueryClient,QueryClientProvider,useMutation,useQuery,useQueryClient} from "@tanstack/react-query";
import * as Tabs from "@radix-ui/react-tabs";
import * as Tooltip from "@radix-ui/react-tooltip";
import {Crown,KeyRound,LayoutDashboard,Moon,Settings,Star,Sun,Users} from "lucide-react";
import type {Snapshot} from "./types";
import {compact,mergeActivity,periodGain,sortRows,todayGain} from "./experience";
import {Avatar} from "./Avatar";
import SettingsDialog from "./SettingsDialog";
import {registerStatusTool} from "./webmcp";
import {syncStatusText} from "./syncStatus";
import {startSession} from "./startSession";
import {dashboardApi as api} from "./dashboardApi";
import {ACTIVITY_REFRESH_MS,DASHBOARD_REFRESH_MS,refreshDue} from "./refreshPolicy";
import "./web.css";

const GrowthPanel=lazy(()=>import("./GrowthPanel"));
const queryClient=new QueryClient({defaultOptions:{queries:{staleTime:DASHBOARD_REFRESH_MS,retry:1,refetchOnWindowFocus:true,refetchOnReconnect:true}}});

function gainLabel(value:bigint|null){return value===null?"자료 없음":`+${compact(value)}`;}
function rankRows(rows:Snapshot[],period:boolean,days:number){
 const sorted=sortRows(rows,false,__EXP_TABLE__);
 if(period)sorted.sort((left,right)=>{const a=periodGain(left,days,__EXP_TABLE__).value,b=periodGain(right,days,__EXP_TABLE__).value;return a===b?0:a===null?1:b===null?-1:a>b?-1:1;});
 return sorted;
}

function App(){
 useEffect(registerStatusTool,[]);
 const cache=useQueryClient();
 const [message,setMessage]=useState(""),[settingsOpen,setSettingsOpen]=useState(false);
 const [primary,setPrimary]=useState(""),[favorites,setFavorites]=useState("");
 const [personal,setPersonal]=useState<Snapshot[]>([]),[selected,setSelected]=useState("");
 const [scope,setScope]=useState<"guild"|"favorites">("guild"),[period,setPeriod]=useState(localStorage.getItem("web-ranking")!=="total");
 const [activeNav,setActiveNav]=useState<"overview"|"guild"|"favorites">("overview");
 const [days,setDays]=useState(Number(localStorage.getItem("web-days"))===7?7:Number(localStorage.getItem("web-days"))===30?30:1);
 const [theme,setTheme]=useState(localStorage.getItem("web-theme")==="light"?"light":"dark"),[online,setOnline]=useState(navigator.onLine);
 const lastActivityAt=useRef(0);
 const statusQuery=useQuery({queryKey:["status"],queryFn:()=>api("/api/status")});
 const sessionQuery=useQuery({queryKey:["session"],queryFn:()=>startSession(api),staleTime:Infinity,retry:1});
 const me=sessionQuery.data;
 const dashboardQuery=useQuery({queryKey:["dashboard"],queryFn:()=>api("/api/dashboard"),enabled:Boolean(me),refetchInterval:DASHBOARD_REFRESH_MS,refetchIntervalInBackground:false});
 const rows=(dashboardQuery.data?.characters||[]) as Snapshot[],sync=dashboardQuery.data?.sync;

 useEffect(()=>{document.documentElement.dataset.theme=theme;localStorage.setItem("web-theme",theme);},[theme]);
 useEffect(()=>{const up=()=>setOnline(true),down=()=>setOnline(false);window.addEventListener("online",up);window.addEventListener("offline",down);return()=>{window.removeEventListener("online",up);window.removeEventListener("offline",down);};},[]);
 useEffect(()=>{if(me){setPrimary(me.primary);setFavorites(me.favorites.join("\n"));}},[me]);
 useEffect(()=>{if(!selected&&me?.primary)setSelected(me.primary);},[selected,me?.primary]);
 function recordActivity(){const now=Date.now();if(!me||!refreshDue(lastActivityAt.current,now,ACTIVITY_REFRESH_MS))return;lastActivityAt.current=now;void api("/api/activity",{}).catch(()=>{});}
 useEffect(()=>{if(!me)return;recordActivity();const action=()=>recordActivity();document.addEventListener("pointerdown",action);document.addEventListener("keydown",action);return()=>{document.removeEventListener("pointerdown",action);document.removeEventListener("keydown",action);};},[Boolean(me)]);

 const saveMutation=useMutation({mutationFn:async()=>{const names=[...new Set(favorites.split(/[\n,]/).map(value=>value.trim()).filter(Boolean))];await api("/api/profile",{primary:primary.trim(),favorites:names});return {primary:primary.trim(),favorites:names,signedIn:me?.signedIn};},onSuccess:data=>{cache.setQueryData(["session"],data);void cache.invalidateQueries({queryKey:["dashboard"]});setSettingsOpen(false);setMessage("설정을 저장했습니다. 다음 공용 수집에 반영됩니다.");},onError:error=>setMessage(String(error))});
 async function logout(){try{await api("/api/logout",{});location.reload();}catch(error){setMessage(String(error));}}
 async function deleteAccount(){const confirmation=window.prompt("계속하려면 ‘탈퇴’를 입력하세요. 공용 캐릭터 기록은 유지됩니다.");if(confirmation!=="탈퇴")return;try{await api("/api/account/delete",{confirmation});location.reload();}catch(error){setMessage(String(error));}}
 function personalRefresh(){
  if(!me?.primary){setSettingsOpen(true);setMessage("대표캐릭터를 먼저 저장하세요.");return;}
  const popup=window.open(__DIRECT_ORIGIN__,"maple-personal","width=620,height=800");if(!popup){setMessage("개인 조회 창의 팝업을 허용해 주세요.");return;}
  const names=[...new Set([me.primary,...me.favorites,...rows.map(row=>row.basic.character_name)])];
  const receive=(event:MessageEvent)=>{if(event.origin!==__DIRECT_ORIGIN__||event.source!==popup)return;if(event.data?.type==="maple-ready")popup.postMessage({type:"maple-targets",primary:me.primary,names},__DIRECT_ORIGIN__);if(event.data?.type==="maple-results"&&Array.isArray(event.data.rows)){const valid=event.data.rows.slice(0,1000).filter((row:any)=>row&&typeof row.basic?.character_name==="string"&&typeof row.ocid==="string"&&Number.isInteger(row.basic.character_level)&&/^\d+$/.test(String(row.basic.character_exp))&&Number.isFinite(Date.parse(row.observedAt)));setPersonal(valid.map((row:Snapshot)=>{const old=rows.find(item=>item.ocid===row.ocid);return {...mergeActivity(old,row,__EXP_TABLE__),history:old?.history||[],todayBaseline:old?.todayBaseline,estimated:old?.estimated,isGuildMember:old?.isGuildMember,guildMembership:old?.guildMembership};}));recordActivity();window.removeEventListener("message",receive);}};
  window.addEventListener("message",receive);setTimeout(()=>window.removeEventListener("message",receive),15*60*1000);
 }

 const merged=useMemo(()=>{const values=rows.map(row=>personal.find(item=>item.ocid===row.ocid&&item.observedAt>row.observedAt)||row);for(const row of personal)if(!values.some(item=>item.ocid===row.ocid))values.push(row);return values;},[rows,personal]);
 const primaryRow=merged.find(row=>row.basic.character_name===me?.primary);
 const guildRows=useMemo(()=>rankRows(merged.filter(row=>row.basic.character_name===me?.primary||(row.isGuildMember??(Boolean(primaryRow?.basic.character_guild_name)&&row.basic.character_guild_name===primaryRow?.basic.character_guild_name&&row.basic.world_name===primaryRow?.basic.world_name))),period,days),[merged,me?.primary,primaryRow?.basic.character_guild_name,primaryRow?.basic.world_name,period,days]);
 const favoriteRows=useMemo(()=>rankRows(merged.filter(row=>row.basic.character_name===me?.primary||me?.favorites.includes(row.basic.character_name)),period,days),[merged,me?.primary,me?.favorites,period,days]);
 const visible=scope==="guild"?guildRows:favoriteRows;
 const selectedRow=merged.find(row=>row.ocid===selected||row.basic.character_name===selected)||primaryRow;
 const primaryRank=primaryRow?guildRows.findIndex(row=>row.ocid===primaryRow.ocid)+1:0;
 const primaryToday=primaryRow?todayGain(primaryRow,__EXP_TABLE__):null,primaryPeriod=primaryRow?periodGain(primaryRow,days,__EXP_TABLE__).value:null;
 const topGain=guildRows[0]?(period?periodGain(guildRows[0],days,__EXP_TABLE__).value:todayGain(guildRows[0],__EXP_TABLE__)):null,ownGain=primaryRow?(period?primaryPeriod:primaryToday):null;
 const gap=topGain!==null&&ownGain!==null&&topGain>ownGain?topGain-ownGain:0n;
 const error=message||String(statusQuery.error||sessionQuery.error||dashboardQuery.error||"");
 const newest=merged.reduce((latest,row)=>Math.max(latest,Date.parse(row.observedAt)),0),delayed=newest>0&&Date.now()-newest>30*60*1000;

 return <Tooltip.Provider delayDuration={300}><div className="app-shell"><aside className="sidebar"><button className="brand" onClick={()=>{setActiveNav("overview");scrollTo({top:0,behavior:"smooth"});}}><span>🍁</span><b>길드원 따라가기</b></button><nav><button className={activeNav==="overview"&&!settingsOpen?"active":""} onClick={()=>{setActiveNav("overview");scrollTo({top:0,behavior:"smooth"});}}><LayoutDashboard/>개요</button><button className={activeNav==="guild"&&!settingsOpen?"active":""} onClick={()=>{setActiveNav("guild");setScope("guild");document.getElementById("ranking")?.scrollIntoView({behavior:"smooth"});}}><Users/>길드 순위</button><button className={activeNav==="favorites"&&!settingsOpen?"active":""} onClick={()=>{setActiveNav("favorites");setScope("favorites");document.getElementById("ranking")?.scrollIntoView({behavior:"smooth"});}}><Star/>즐겨찾기</button><button className={settingsOpen?"active":""} onClick={()=>setSettingsOpen(true)}><Settings/>설정</button></nav><span className="source">Data based on NEXON Open API</span></aside>
 <main className="dashboard"><header className="topbar"><div><span className="section-kicker">{primaryRow?`${primaryRow.basic.world_name} · ${primaryRow.basic.character_class}`:"MAPLESTORY EXP TRACKER"}</span><h1>{me?.primary?`${me.primary}님의 성장 기록`:"매일의 성장을 한눈에."}</h1></div><div className="top-actions"><div className="period-control" aria-label="조회 기간">{[1,7,30].map(value=><button key={value} aria-pressed={days===value} onClick={()=>{setDays(value);localStorage.setItem("web-days",String(value));}}>{value===1?"오늘":`${value}일`}</button>)}</div><Tooltip.Root><Tooltip.Trigger asChild><button className="icon-button" aria-label="테마 전환" onClick={()=>setTheme(theme==="dark"?"light":"dark")}>{theme==="dark"?<Sun/>:<Moon/>}</button></Tooltip.Trigger><Tooltip.Portal><Tooltip.Content className="tooltip-content" sideOffset={7}>{theme==="dark"?"라이트 테마":"다크 테마"}</Tooltip.Content></Tooltip.Portal></Tooltip.Root><button className="icon-button mobile-settings" aria-label="설정" onClick={()=>setSettingsOpen(true)}><Settings/></button></div></header>
 {!online&&<div className="state-banner offline">오프라인입니다. 마지막으로 저장된 기록을 표시합니다.</div>}{delayed&&online&&<div className="state-banner warning">공용 수집이 지연되고 있습니다. 마지막 저장 기록을 계속 표시합니다.</div>}{error&&<div role="alert" className="state-banner error">{error}</div>}
 {!me?<section className="surface loading-card"><span className="spinner"/><div><b>이 브라우저의 설정을 준비하고 있어요.</b><p>로그인 없이 바로 사용할 수 있습니다.</p></div></section>:<>
 <section className="hero-card">{primaryRow?<><Avatar character={primaryRow}/><div className="hero-info"><span className="section-kicker"><Crown/> 대표캐릭터</span><h2>{primaryRow.basic.character_name}{primaryRow.isHunting&&<span className="hunting-fire" title="최근 경험치 변화 감지">🔥</span>}<small>Lv.{primaryRow.basic.character_level}</small></h2><strong>{primaryRow.basic.character_exp_rate}%</strong><p>오늘 <b>{gainLabel(primaryToday)}</b>{days>1&&<> · {days}일 <b>{gainLabel(primaryPeriod)}</b></>}</p></div><div className="hero-rank"><span>길드 순위</span><strong>{primaryRank||"—"}{primaryRank>0&&"위"}</strong><small>{gap>0n?`1위까지 ${compact(gap)}`:"현재 선두권"}</small></div></>:<div className="hero-empty"><KeyRound/><div><h2>대표캐릭터를 지정해 주세요.</h2><p>설정 후 다음 15분 수집부터 길드와 성장 기록을 확인합니다.</p></div><button className="primary-button" onClick={()=>setSettingsOpen(true)}>설정 열기</button></div>}</section>
 <div className="dashboard-grid"><Tabs.Root value={scope} onValueChange={value=>{const next=value as "guild"|"favorites";setScope(next);setActiveNav(next);}} className="surface ranking-panel" id="ranking"><div className="section-heading"><div><span className="section-kicker">{scope==="guild"?"GUILD RANKING":"FAVORITE RANKING"}</span><h2>{scope==="guild"?"길드 순위":"즐겨찾기 순위"}</h2></div><Tabs.List className="tab-list" aria-label="순위 범위"><Tabs.Trigger value="guild">길드</Tabs.Trigger><Tabs.Trigger value="favorites">즐겨찾기</Tabs.Trigger></Tabs.List></div><div className="ranking-tools"><div className="mode-control"><button aria-pressed={period} onClick={()=>{setPeriod(true);localStorage.setItem("web-ranking","period");}}>기간별 경험치</button><button aria-pressed={!period} onClick={()=>{setPeriod(false);localStorage.setItem("web-ranking","total");}}>전체 경험치</button></div><button className="quiet-button" onClick={personalRefresh}><KeyRound/>개인 키로 새로고침</button></div><p className="sync-line">서버 {syncStatusText(sync)} · {period?`오늘 포함 ${days}일 획득량`:"레벨과 현재 경험치"} 기준</p>
 {visible.length?<div className="ranking-list" role="table"><div className="ranking-head" role="row"><span>순위</span><span>캐릭터</span><span>레벨 · 현재 경험치</span><span>{period?`${days}일 획득`:"오늘 획득"}</span><span>조회</span></div>{visible.map((row,index)=>{const result=period?periodGain(row,days,__EXP_TABLE__):null;const gain=period?result!.value:todayGain(row,__EXP_TABLE__);return <button className={`ranking-row ${row.ocid===selectedRow?.ocid?"selected":""}`} key={row.ocid} onClick={()=>setSelected(row.ocid)} role="row"><i>{String(index+1).padStart(2,"0")}</i><Avatar character={row}/><span className="identity"><b>{row.basic.character_name===me.primary&&<Crown/>}{row.basic.character_name}{row.isHunting&&<span className="hunting-fire" title="최근 경험치 변화 감지">🔥</span>}</b><small>{row.basic.character_class}</small></span><span className="level">Lv.{row.basic.character_level}<small>{row.basic.character_exp_rate}%</small></span><strong>{gainLabel(gain)}{period&&!result!.complete?<small>일부 수집</small>:row.estimated?<small>추정</small>:null}</strong><span className="observed">{personal.some(item=>item.ocid===row.ocid&&item.observedAt===row.observedAt)?"개인":"서버"}<small>{new Date(row.observedAt).toLocaleTimeString("ko-KR",{hour12:false,hour:"2-digit",minute:"2-digit"})}</small></span></button>;})}</div>:<div className="empty-state"><b>아직 표시할 기록이 없습니다.</b><span>대표캐릭터 저장 후 첫 수집 진행 상황을 확인해 주세요.</span></div>}
 </Tabs.Root><Suspense fallback={<section className="surface growth-panel"><span className="spinner"/></section>}><GrowthPanel character={selectedRow} days={days}/></Suspense></div>
 <section className="data-note"><b>기록 안내</b><p>자정 근처 또는 오전 2시 근처의 획득량은 NEXON API 제공 시점상 날짜 경계가 불확실할 수 있으며, 공식 일별 기록이 준비되면 재정렬될 수 있습니다. 기준 자료가 없는 값은 0이 아닌 자료 없음으로 표시합니다.</p></section></>}
 <footer className="mobile-source">Data based on NEXON Open API</footer></main>
 <nav className="mobile-nav"><button className={activeNav==="overview"&&!settingsOpen?"active":""} onClick={()=>{setActiveNav("overview");scrollTo({top:0,behavior:"smooth"});}}><LayoutDashboard/><span>개요</span></button><button className={activeNav==="guild"&&!settingsOpen?"active":""} onClick={()=>{setActiveNav("guild");setScope("guild");document.getElementById("ranking")?.scrollIntoView({behavior:"smooth"});}}><Users/><span>순위</span></button><button className={activeNav==="favorites"&&!settingsOpen?"active":""} onClick={()=>{setActiveNav("favorites");setScope("favorites");document.getElementById("ranking")?.scrollIntoView({behavior:"smooth"});}}><Star/><span>즐겨찾기</span></button><button className={settingsOpen?"active":""} onClick={()=>setSettingsOpen(true)}><Settings/><span>설정</span></button></nav>
 {me&&<SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} primary={primary} setPrimary={setPrimary} favorites={favorites} setFavorites={setFavorites} signedIn={Boolean(me.signedIn)} providers={statusQuery.data?.providers||[]} onSave={()=>saveMutation.mutate()} onLogout={()=>void logout()} onDelete={()=>void deleteAccount()}/>}</div></Tooltip.Provider>;
}

createRoot(document.getElementById("root")!).render(<QueryClientProvider client={queryClient}><App/></QueryClientProvider>);
