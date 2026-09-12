// 공개 기록을 상단 탐색·가상 순위·성장 및 따라잡기 화면으로 제공합니다.
import {lazy,Suspense,useDeferredValue,useEffect,useMemo,useRef,useState} from "react";
import {createRoot} from "react-dom/client";
import {QueryClient,QueryClientProvider,useMutation,useQuery,useQueryClient} from "@tanstack/react-query";
import * as Tooltip from "@radix-ui/react-tooltip";
import {Crown,KeyRound,LayoutDashboard,Moon,Settings,Star,Sun,TrendingUp,Users} from "lucide-react";
import type {Snapshot} from "./types";
import {compact,mergeActivity,periodGain,sortRows,todayGain} from "./experience";
import {levelUpProjection} from "./projections";
import {Avatar} from "./Avatar";
import {VirtualRanking} from "./VirtualRanking";
import SettingsDialog from "./SettingsDialog";
import {registerStatusTool} from "./webmcp";
import {syncStatusText} from "./syncStatus";
import {startSession} from "./startSession";
import {dashboardApi as api} from "./dashboardApi";
import {ACTIVITY_REFRESH_MS,DASHBOARD_REFRESH_MS,refreshDue} from "./refreshPolicy";
import "./web.css";

const GrowthPanel=lazy(()=>import("./GrowthPanel"));
const ChasePanel=lazy(()=>import("./ChasePanel"));
const queryClient=new QueryClient({defaultOptions:{queries:{staleTime:DASHBOARD_REFRESH_MS,retry:1,refetchOnWindowFocus:true,refetchOnReconnect:true}}});
type View="overview"|"guild"|"favorites"|"chase";
const validView=(value:string):value is View=>["overview","guild","favorites","chase"].includes(value);
const initialView=():View=>{const value=location.hash.slice(1);return validView(value)?value:"overview";};
const storedDays=(key:string,defaultValue:1|7|30):1|7|30=>{const current=Number(localStorage.getItem(key)||localStorage.getItem("web-days"));return current===7?7:current===30?30:current===1?1:defaultValue;};
const gainLabel=(value:bigint|null)=>value===null?"자료 없음":`+${compact(value)}`;
function rankRows(rows:Snapshot[],period:boolean,days:number,gains?:Map<string,Map<number,bigint|null>>){const total=sortRows(rows,false,__EXP_TABLE__),tie=new Map(total.map((row,index)=>[row.ocid,index]));if(!period)return total;return [...rows].sort((left,right)=>{const a=gains?.get(left.ocid)?.get(days)??periodGain(left,days,__EXP_TABLE__).value,b=gains?.get(right.ocid)?.get(days)??periodGain(right,days,__EXP_TABLE__).value;if(a===b)return (tie.get(left.ocid)??0)-(tie.get(right.ocid)??0);return a===null?1:b===null?-1:a>b?-1:1;});}

export function PublicApp(){
 useEffect(registerStatusTool,[]);const cache=useQueryClient();
 const [message,setMessage]=useState(""),[settingsOpen,setSettingsOpen]=useState(location.hash==="#settings"),[view,setView]=useState<View>(initialView);
 const [primary,setPrimary]=useState(""),[favorites,setFavorites]=useState(""),[personal,setPersonal]=useState<Snapshot[]>([]),[selected,setSelected]=useState("");
 const [rankingPeriod,setRankingPeriod]=useState(localStorage.getItem("web-ranking")!=="total"),[rankingDays,setRankingDays]=useState<1|7|30>(()=>storedDays("web-ranking-days",1)),[growthDays,setGrowthDays]=useState<1|7|30>(()=>storedDays("web-growth-days",7));
 const deferredRankingPeriod=useDeferredValue(rankingPeriod),deferredRankingDays=useDeferredValue(rankingDays);
 const [theme,setTheme]=useState(localStorage.getItem("web-theme")==="light"?"light":"dark"),[online,setOnline]=useState(navigator.onLine);const lastActivityAt=useRef(0);
 const statusQuery=useQuery({queryKey:["status"],queryFn:()=>api("/api/status")});
 const sessionQuery=useQuery({queryKey:["session"],queryFn:()=>startSession(api),staleTime:Infinity,retry:1});const me=sessionQuery.data;
 const dashboardQuery=useQuery({queryKey:["dashboard"],queryFn:()=>api("/api/dashboard"),enabled:Boolean(me),refetchInterval:DASHBOARD_REFRESH_MS,refetchIntervalInBackground:false});
 const rows=(dashboardQuery.data?.characters||[]) as Snapshot[],sync=dashboardQuery.data?.sync;
 useEffect(()=>{const onHash=()=>{const hash=location.hash.slice(1);if(hash==="settings"){setSettingsOpen(true);return;}if(validView(hash)){setView(hash);setSettingsOpen(false);}};addEventListener("hashchange",onHash);return()=>removeEventListener("hashchange",onHash);},[]);
 const navigate=(next:View)=>{setView(next);setSettingsOpen(false);if(location.hash!==`#${next}`)history.pushState(null,"",`#${next}`);scrollTo({top:0,behavior:"instant"});};
 const openSettings=()=>{setSettingsOpen(true);history.pushState(null,"","#settings");};
 const closeSettings=(open:boolean)=>{setSettingsOpen(open);if(!open&&location.hash==="#settings")history.replaceState(null,"",`#${view}`);};
 useEffect(()=>{document.documentElement.dataset.theme=theme;localStorage.setItem("web-theme",theme);},[theme]);
 useEffect(()=>{const up=()=>setOnline(true),down=()=>setOnline(false);addEventListener("online",up);addEventListener("offline",down);return()=>{removeEventListener("online",up);removeEventListener("offline",down);};},[]);
 useEffect(()=>{if(me){setPrimary(me.primary);setFavorites(me.favorites.join("\n"));}},[me]);
 useEffect(()=>{if(!selected&&me?.primary)setSelected(me.primary);},[selected,me?.primary]);
 function recordActivity(){const now=Date.now();if(!me||!refreshDue(lastActivityAt.current,now,ACTIVITY_REFRESH_MS))return;lastActivityAt.current=now;void api("/api/activity",{}).catch(()=>{});}
 useEffect(()=>{if(!me)return;recordActivity();const action=()=>recordActivity();document.addEventListener("pointerdown",action);document.addEventListener("keydown",action);return()=>{document.removeEventListener("pointerdown",action);document.removeEventListener("keydown",action);};},[Boolean(me)]);
 const saveMutation=useMutation({mutationFn:async()=>{const names=[...new Set(favorites.split(/[\n,]/).map(value=>value.trim()).filter(Boolean))];await api("/api/profile",{primary:primary.trim(),favorites:names});return {primary:primary.trim(),favorites:names,signedIn:me?.signedIn};},onSuccess:data=>{cache.setQueryData(["session"],data);void cache.invalidateQueries({queryKey:["dashboard"]});closeSettings(false);setMessage("설정을 저장했습니다. 다음 공용 수집에 반영됩니다.");},onError:error=>setMessage(String(error))});
 async function logout(){try{await api("/api/logout",{});location.reload();}catch(error){setMessage(String(error));}}
 async function deleteAccount(){const confirmation=prompt("계속하려면 ‘탈퇴’를 입력하세요. 공용 캐릭터 기록은 유지됩니다.");if(confirmation!=="탈퇴")return;try{await api("/api/account/delete",{confirmation});location.reload();}catch(error){setMessage(String(error));}}
 function personalRefresh(){
  if(!me?.primary){openSettings();setMessage("대표캐릭터를 먼저 저장하세요.");return;}const popup=window.open(__DIRECT_ORIGIN__,"maple-personal","width=620,height=800");if(!popup){setMessage("개인 조회 창의 팝업을 허용해 주세요.");return;}
  const names=[...new Set([me.primary,...me.favorites,...rows.map(row=>row.basic.character_name)])];const receive=(event:MessageEvent)=>{if(event.origin!==__DIRECT_ORIGIN__||event.source!==popup)return;if(event.data?.type==="maple-ready")popup.postMessage({type:"maple-targets",primary:me.primary,names},__DIRECT_ORIGIN__);if(event.data?.type==="maple-results"&&Array.isArray(event.data.rows)){const valid=event.data.rows.slice(0,1000).filter((row:any)=>row&&typeof row.basic?.character_name==="string"&&typeof row.ocid==="string"&&Number.isInteger(row.basic.character_level)&&/^\d+$/.test(String(row.basic.character_exp))&&Number.isFinite(Date.parse(row.observedAt)));setPersonal(valid.map((row:Snapshot)=>{const old=rows.find(item=>item.ocid===row.ocid);return {...mergeActivity(old,row,__EXP_TABLE__),history:old?.history||[],todayBaseline:old?.todayBaseline,estimated:old?.estimated,isGuildMember:old?.isGuildMember,guildMembership:old?.guildMembership};}));recordActivity();removeEventListener("message",receive);}};addEventListener("message",receive);setTimeout(()=>removeEventListener("message",receive),15*60*1000);
 }
 const merged=useMemo(()=>{const values=rows.map(row=>personal.find(item=>item.ocid===row.ocid&&item.observedAt>row.observedAt)||row);for(const row of personal)if(!values.some(item=>item.ocid===row.ocid))values.push(row);return values;},[rows,personal]);
 const gainCache=useMemo(()=>new Map(merged.map(row=>[
  row.ocid,
  new Map<number,bigint|null>([
   [1,periodGain(row,1,__EXP_TABLE__).value],
   [7,periodGain(row,7,__EXP_TABLE__).value],
   [30,periodGain(row,30,__EXP_TABLE__).value],
  ]),
 ] as const)),[merged]);
 const primaryRow=merged.find(row=>row.basic.character_name===me?.primary);
 const rawGuild=useMemo(()=>merged.filter(row=>row.basic.character_name===me?.primary||(row.isGuildMember??(Boolean(primaryRow?.basic.character_guild_name)&&row.basic.character_guild_name===primaryRow?.basic.character_guild_name&&row.basic.world_name===primaryRow?.basic.world_name))),[merged,me?.primary,primaryRow?.basic.character_guild_name,primaryRow?.basic.world_name]);
 const rawFavorites=useMemo(()=>merged.filter(row=>row.basic.character_name===me?.primary||me?.favorites.includes(row.basic.character_name)),[merged,me?.primary,me?.favorites]);
 const guildRows=useMemo(()=>rankRows(rawGuild,deferredRankingPeriod,deferredRankingDays,gainCache),[rawGuild,deferredRankingPeriod,deferredRankingDays,gainCache]),favoriteRows=useMemo(()=>rankRows(rawFavorites,deferredRankingPeriod,deferredRankingDays,gainCache),[rawFavorites,deferredRankingPeriod,deferredRankingDays,gainCache]);
 const visible=view==="favorites"?favoriteRows:guildRows,selectedRow=merged.find(row=>row.ocid===selected||row.basic.character_name===selected)||primaryRow;
 const overallGuild=useMemo(()=>rankRows(rawGuild,false,rankingDays,gainCache),[rawGuild,rankingDays,gainCache]),primaryRank=primaryRow?overallGuild.findIndex(row=>row.ocid===primaryRow.ocid)+1:0;
 const primaryToday=primaryRow?todayGain(primaryRow,__EXP_TABLE__):null,primaryWeek=primaryRow?periodGain(primaryRow,7,__EXP_TABLE__).value:null,projection=primaryRow?levelUpProjection(primaryRow,__EXP_TABLE__):null;
 const newest=merged.reduce((latest,row)=>Math.max(latest,Date.parse(row.observedAt)),0),delayed=newest>0&&Date.now()-newest>30*60*1000,error=message||String(statusQuery.error||sessionQuery.error||dashboardQuery.error||"");
 const personalOcids=useMemo(()=>new Set(personal.map(row=>row.ocid)),[personal]);
 const nav:[View,string,typeof LayoutDashboard][]=[["overview","개요",LayoutDashboard],["guild","길드 순위",Users],["favorites","즐겨찾기",Star],["chase","따라잡기",TrendingUp]];const ads:never[]=[];
 const rankPage=(title:string)=><section className="surface ranking-panel page-panel"><div className="section-heading"><div><span className="section-kicker">{view==="favorites"?"FAVORITE RANKING":"GUILD RANKING"}</span><h1>{title}</h1></div><div className="ranking-actions"><div className="period-control" aria-label="순위 기간">{([1,7,30] as const).map(value=><button key={value} aria-pressed={rankingDays===value} onClick={()=>{setRankingDays(value);localStorage.setItem("web-ranking-days",String(value));}}>{value===1?"오늘":`${value}일`}</button>)}</div><div className="mode-control"><button aria-pressed={rankingPeriod} onClick={()=>{setRankingPeriod(true);localStorage.setItem("web-ranking","period");}}>기간별 경험치</button><button aria-pressed={!rankingPeriod} onClick={()=>{setRankingPeriod(false);localStorage.setItem("web-ranking","total");}}>전체 경험치</button></div><button className="quiet-button" onClick={personalRefresh}><KeyRound/>개인 키 새로고침</button></div></div><p className="sync-line">서버 {syncStatusText(sync)} · {rankingPeriod?`오늘 포함 ${rankingDays}일 획득량`:"레벨과 현재 경험치"} 기준</p>{visible.length?<VirtualRanking rows={visible} primaryName={me?.primary||""} selected={selectedRow?.ocid} onSelect={row=>{setSelected(row.ocid);navigate("overview");requestAnimationFrame(()=>document.getElementById("growth")?.scrollIntoView({behavior:"smooth"}));}} period={rankingPeriod} days={rankingDays} personalOcids={personalOcids}/>:<div className="empty-state"><b>아직 표시할 기록이 없습니다.</b><span>대표캐릭터 저장 후 첫 수집 진행 상황을 확인해 주세요.</span></div>}</section>;
 return <Tooltip.Provider delayDuration={300}><div className="app-shell">{dashboardQuery.isFetching&&dashboardQuery.data&&<div className="top-progress"/>}<header className="site-header"><button className="brand" onClick={()=>navigate("overview")}><span>🍁</span><b>길드원 따라가기</b></button><nav>{nav.map(([key,label,Icon])=><button key={key} className={view===key&&!settingsOpen?"active":""} onClick={()=>navigate(key)}><Icon/>{label}</button>)}</nav><div className="header-actions"><Tooltip.Root><Tooltip.Trigger asChild><button className="icon-button" aria-label="테마 전환" onClick={()=>setTheme(theme==="dark"?"light":"dark")}>{theme==="dark"?<Sun/>:<Moon/>}</button></Tooltip.Trigger><Tooltip.Content className="tooltip-content">테마 전환</Tooltip.Content></Tooltip.Root><button className={settingsOpen?"icon-button active":"icon-button"} aria-label="설정" onClick={openSettings}><Settings/></button></div></header>
 <div className={`page-layout ${ads.length?"with-ads":""}`}>{ads.length?<aside className="ad-rail left"/>:null}<main className="dashboard">{!online&&<div className="state-banner offline">오프라인입니다. 마지막 저장 기록을 표시합니다.</div>}{delayed&&online&&<div className="state-banner warning">공용 수집이 지연되고 있습니다. 마지막 저장 기록을 계속 표시합니다.</div>}{error&&<div role="alert" className="state-banner error">{error}</div>}
 {!me?<section className="surface loading-card"><span className="spinner"/><div><b>이 브라우저의 설정을 준비하고 있어요.</b><p>로그인 없이 바로 사용할 수 있습니다.</p></div></section>:view==="overview"?<><section className="hero-card">{primaryRow?<><Avatar character={primaryRow}/><div className="hero-info"><span className="section-kicker"><Crown/> 대표캐릭터</span><h2>{primaryRow.basic.character_name}{primaryRow.isHunting&&<span className="hunting-fire">🔥</span>}<small>Lv.{primaryRow.basic.character_level}</small></h2><strong>{primaryRow.basic.character_exp_rate}%</strong><p>오늘 <b>{gainLabel(primaryToday)}</b> · 7일 <b>{gainLabel(primaryWeek)}</b></p><small className="projection-label">다음 레벨업 예상 {projection?.label}</small></div><div className="hero-rank"><span>길드 순위</span><strong>{primaryRank||"—"}{primaryRank>0&&"위"}</strong><small>{overallGuild.length}명 기준</small></div></>:<div className="hero-empty"><KeyRound/><div><h2>대표캐릭터를 지정해 주세요.</h2><p>설정 후 다음 수집부터 길드와 성장 기록을 확인합니다.</p></div><button className="primary-button" onClick={openSettings}>설정 열기</button></div>}</section><section className="overview-grid"><div className="surface overview-ranking"><div className="section-heading"><div><span className="section-kicker">TOP RANKING</span><h2>길드 상위 성장</h2></div><button className="quiet-button" onClick={()=>navigate("guild")}>전체 보기</button></div>{guildRows.slice(0,5).map((row,index)=><button key={row.ocid} onClick={()=>setSelected(row.ocid)}><i>{index+1}</i><Avatar character={row}/><span><b>{row.basic.character_name}</b><small>Lv.{row.basic.character_level} · {row.basic.character_exp_rate}%</small></span><strong>{gainLabel(rankingPeriod?periodGain(row,rankingDays,__EXP_TABLE__).value:todayGain(row,__EXP_TABLE__))}</strong></button>)}</div><Suspense fallback={<section className="surface growth-panel"><span className="spinner"/></section>}><GrowthPanel character={selectedRow} days={growthDays} onDays={value=>{setGrowthDays(value);localStorage.setItem("web-growth-days",String(value));}}/></Suspense></section></>:view==="guild"?rankPage("길드 순위"):view==="favorites"?rankPage("즐겨찾기 순위"):<Suspense fallback={<section className="surface loading-card"><span className="spinner"/></section>}><ChasePanel rows={merged} guildRows={rawGuild} favoriteRows={rawFavorites} primary={primaryRow} signedIn={Boolean(me.signedIn)} api={api}/></Suspense>}
 {me&&<section className="data-note"><b>기록 안내</b><p>자정 또는 오전 2시 근처의 획득량은 NEXON API 날짜 경계상 공식 일별 기록이 준비되면 재정렬될 수 있습니다. 누락 자료는 0으로 처리하지 않습니다.</p></section>}<footer className="mobile-source">Data based on NEXON Open API</footer></main>{ads.length?<aside className="ad-rail right"/>:null}</div>
 <nav className="mobile-nav">{nav.map(([key,label,Icon])=><button key={key} className={view===key&&!settingsOpen?"active":""} onClick={()=>navigate(key)}><Icon/><span>{label.replace(" 순위","")}</span></button>)}<button className={settingsOpen?"active":""} onClick={openSettings}><Settings/><span>설정</span></button></nav>
 {me&&<SettingsDialog open={settingsOpen} onOpenChange={closeSettings} primary={primary} setPrimary={setPrimary} favorites={favorites} setFavorites={setFavorites} signedIn={Boolean(me.signedIn)} providers={statusQuery.data?.providers||[]} onSave={()=>saveMutation.mutate()} onLogout={()=>void logout()} onDelete={()=>void deleteAccount()}/>}</div></Tooltip.Provider>;
}

createRoot(document.getElementById("root")!).render(<QueryClientProvider client={queryClient}><PublicApp/></QueryClientProvider>);
