// 서비스 키를 격리 보관하고 사용자 기기에서 길드 기록을 직접 수집합니다.
import {useEffect,useState} from "react";
import {createRoot} from "react-dom/client";
import {mergeActivity,parseNexon,kstDate} from "./experience";
import type {Basic,HistoryBasic,Snapshot} from "./types";
import type {DashboardToDirect,DirectStatus,DirectToDashboard} from "./directProtocol";
import {directProgress,validConfiguration,validDashboardMessage} from "./directProtocol";
import {directStore} from "./directStore";
import {DIRECT_MIN_INTERVAL_MS,recoveredInterval,retryAfterDelay,slowedInterval} from "./directRate";
import {readPersonal,writePersonal} from "./personalStorage";
import "./web.css";

declare global {interface Window {AndroidDirect?:{storeServiceKeyOnDevice:(value:string)=>boolean;importSnapshots:(payload:string)=>boolean}}}

const KEY="maple-personal-key",CONFIRMED="maple-service-confirmed",REFRESH_MS=15*60*1000;
const MAX_TARGETS=1000,MAX_DAILY_REQUESTS=200_000;
export const directConcurrency=(hardware=navigator.hardwareConcurrency||8)=>Math.max(8,Math.min(32,hardware*2));
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const isoDay=(offset:number)=>{const value=new Date(`${kstDate()}T00:00:00Z`);value.setUTCDate(value.getUTCDate()+offset);return value.toISOString().slice(0,10);};
const notifyControl=()=>{if("BroadcastChannel" in window){const channel=new BroadcastChannel("maple-personal-control");channel.postMessage("key-changed");channel.close();}};
const historyBasic=(value:Basic):HistoryBasic=>({character_level:value.character_level,character_exp:String(value.character_exp),character_exp_rate:String(value.character_exp_rate)});

class NexonClient{
 private nextSlot=0;private interval=DIRECT_MIN_INTERVAL_MS;private requestCount=0;private requestDay=kstDate();private runRequests=0;private rateLimits=0;private successStreak=0;
 constructor(private key:string,private signal:AbortSignal){}
 async initialize(){const saved=await directStore.meta<{date:string;count:number}>("request-budget");if(saved?.date===this.requestDay)this.requestCount=saved.count;}
 private async pace(){const now=Date.now(),slot=Math.max(now,this.nextSlot);this.nextSlot=slot+this.interval;if(slot>now)await delay(slot-now);}
 async request(path:string,params:Record<string,string>):Promise<any>{
  for(let attempt=0;attempt<4;attempt++){
   if(this.requestDay!==kstDate()){this.requestDay=kstDate();this.requestCount=0;}
   if(this.requestCount>=MAX_DAILY_REQUESTS)throw new Error("이 기기의 일일 안전 조회 한도에 도달했습니다.");
   await this.pace();this.requestCount++;this.runRequests++;if(this.requestCount%100===0)void directStore.saveMeta("request-budget",{date:this.requestDay,count:this.requestCount});
   const url=new URL(`https://open.api.nexon.com/maplestory/v1/${path}`);url.search=new URLSearchParams(params).toString();
   const timeout=AbortSignal.timeout(20_000),signal=typeof AbortSignal.any==="function"?AbortSignal.any([this.signal,timeout]):this.signal;
   const response=await fetch(url,{headers:{"x-nxopen-api-key":this.key},credentials:"omit",referrerPolicy:"no-referrer",signal});
   if(response.ok){if(++this.successStreak>=50){this.interval=recoveredInterval(this.interval);this.successStreak=0;}return parseNexon(await response.text());}
   if(response.status===429){this.rateLimits++;this.successStreak=0;this.interval=slowedInterval(this.interval);}
   if((response.status===429||response.status>=500)&&attempt<3){let wait=700*2**attempt+Math.random()*300;if(response.status===429)wait=Math.max(wait,retryAfterDelay(response.headers.get("retry-after")));await delay(wait);continue;}
   if(response.status===429)throw new Error("호출 한도에 도달했습니다. 서비스 단계 키인지 확인해 주세요.");
   throw new Error("NEXON API 응답을 확인해 주세요.");
  }
  throw new Error("NEXON API 재시도 횟수를 초과했습니다.");
 }
 metrics(){return {requests:this.runRequests,rateLimits:this.rateLimits};}
}

async function parallel<T>(values:T[],work:(value:T,index:number)=>Promise<void>){let cursor=0;const runner=async()=>{while(cursor<values.length){const index=cursor++;await work(values[index],index);}};await Promise.all(Array.from({length:Math.min(directConcurrency(),values.length)},runner));}

class DirectEngine{
 private port:MessagePort|null=null;private primary="";private favorites:string[]=[];private automatic=false;private timer=0;private running:Promise<void>|null=null;private cacheLoad:Promise<void>|null=null;private cacheRows:Snapshot[]=[];private progressTimer=0;private lastProgressAt=0;private controller:AbortController|null=null;private revision=0;
 private status:DirectStatus={cacheReady:false,keyStored:Boolean(readPersonal(KEY)),serviceConfirmed:readPersonal(CONFIRMED)==="1",busy:false,phase:"idle",completed:0,total:0,progressPercent:0,failed:0,lastSuccessAt:null,nextRefreshAt:null,cachedCount:0,storagePersistent:null,metrics:null,message:"서비스 키를 설정해 주세요."};
 connect(port:MessagePort){this.port=port;port.onmessage=event=>this.receive(event.data);port.start();this.cacheLoad=this.loadCache().finally(()=>{this.cacheLoad=null;});this.arm();}
 private send(value:DirectToDashboard){this.port?.postMessage(value);}
 private importAndroid(rows:Snapshot[],guildKey:string){if(!window.AndroidDirect)return;try{window.AndroidDirect.importSnapshots(JSON.stringify({primary:this.primary,favorites:this.favorites,guildKey,rows}));}catch{/* Android 네이티브 저장 실패는 웹 직접 조회를 막지 않습니다. */}}
 private report(patch:Partial<DirectStatus>={}){window.clearTimeout(this.progressTimer);this.progressTimer=0;this.status={...this.status,...patch};this.lastProgressAt=performance.now();this.send({type:"status",status:this.status});}
 private progress(completed:number,failed=this.status.failed){const progressPercent=directProgress(completed,this.status.total);this.status={...this.status,completed,failed,progressPercent};const elapsed=performance.now()-this.lastProgressAt;if(elapsed>=250){this.lastProgressAt=performance.now();this.send({type:"status",status:this.status});return;}if(!this.progressTimer)this.progressTimer=window.setTimeout(()=>{this.progressTimer=0;this.lastProgressAt=performance.now();this.send({type:"status",status:this.status});},250-elapsed);}
 private async loadCache(){let rows=await directStore.snapshots();const active=await directStore.meta<string[]>("active-ocids"),last=await directStore.meta<string>("last-success"),persistent=await navigator.storage?.persisted?.();if(active?.length){const selected=new Set(active);rows=rows.filter(row=>selected.has(row.ocid));}this.cacheRows=rows;if(rows.length)this.send({type:"snapshot",rows});this.report({cacheReady:true,cachedCount:rows.length,lastSuccessAt:last||null,nextRefreshAt:last?new Date(Date.parse(last)+REFRESH_MS).toISOString():null,storagePersistent:persistent??null});}
 private receive(value:unknown){
  if(!validDashboardMessage(value))return;
  if(validConfiguration(value)){const primary=value.primary.trim(),favorites=[...new Set(value.favorites.map(name=>name.trim()).filter(Boolean))].slice(0,30),changed=primary!==this.primary||favorites.join("\0")!==this.favorites.join("\0");this.primary=primary;this.favorites=favorites;this.automatic=value.automatic;if(changed){this.revision++;this.controller?.abort();if(this.running){const active=this.running;void active.then(()=>this.refresh(true));}else void this.refreshIfDue();}else void this.refreshIfDue();}
  else if(value?.type==="refresh")void this.refresh(true);
  else if(value?.type==="delete-key"){writePersonal(KEY,null);writePersonal(CONFIRMED,null);this.report({keyStored:false,serviceConfirmed:false,nextRefreshAt:null,message:"저장된 키를 삭제했습니다."});}
 }
 private arm(){window.clearInterval(this.timer);this.timer=window.setInterval(()=>void this.refreshIfDue(),60_000);for(const event of ["online","pageshow"] as const)addEventListener(event,()=>void this.refreshIfDue());document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")void this.refreshIfDue();});if("BroadcastChannel" in window)new BroadcastChannel("maple-personal-control").onmessage=()=>{this.report({keyStored:Boolean(readPersonal(KEY)),serviceConfirmed:readPersonal(CONFIRMED)==="1"});if(this.running){const active=this.running;void active.then(()=>this.refresh(true));}else void this.refresh(true);};}
 private async refreshIfDue(){if(!this.automatic||!this.primary)return;const last=await directStore.meta<string>("last-success");if(!last||Date.now()-Date.parse(last)>=REFRESH_MS)void this.refresh(false);}
 refresh(manual:boolean){if(this.running)return this.running;this.running=this.run(manual).finally(()=>{this.running=null;});return this.running;}
 private async run(manual:boolean){
  await this.cacheLoad;
  const key=readPersonal(KEY)||"";if(!key||readPersonal(CONFIRMED)!=="1"){this.report({keyStored:Boolean(key),serviceConfirmed:false,message:"서비스 단계 API 키를 설정해 주세요."});return;}
  const execute=async()=>{
   const revision=this.revision,controller=new AbortController();this.controller=controller;
   this.report({busy:true,phase:"preparing",completed:0,total:0,progressPercent:2,failed:0,message:manual?"수동 조회를 준비합니다.":"자동 조회를 준비합니다."});
   try{
    const runStarted=performance.now(),api=new NexonClient(key,controller.signal);await api.initialize();const previous=this.cacheRows.length?this.cacheRows:await directStore.snapshots(),byName=new Map(previous.map(row=>[row.basic.character_name,row])),identityUpdates:{name:string;ocid:string;checkedAt:number}[]=[];
    const readCurrent=async(name:string,known:Map<string,{name:string;ocid:string;checkedAt:number}>)=>{
     let ocid=known.get(name)?.ocid;
     if(ocid)try{const basic=await api.request("character/basic",{ocid}) as Basic;if(basic.character_name===name)return {ocid,basic};}catch{/* 캐시 OCID가 유효하지 않으면 이름으로 한 번만 복구합니다. */}
     const found=await api.request("id",{character_name:name});ocid=String(found.ocid);identityUpdates.push({name,ocid,checkedAt:Date.now()});return {ocid,basic:await api.request("character/basic",{ocid}) as Basic};
    };
    const primaryIdentities=await directStore.identities([this.primary]),primary=await readCurrent(this.primary,primaryIdentities);let guildKey="",members:string[]=[];
    if(primary.basic.character_guild_name){const guildCacheKey=`${primary.basic.world_name}\0${primary.basic.character_guild_name}`,cachedGuild=await directStore.meta<{key:string;id:string}>("current-guild");guildKey=cachedGuild?.key===guildCacheKey?cachedGuild.id:"";const loadRoster=async()=>{if(!guildKey){const guild=await api.request("guild/id",{guild_name:primary.basic.character_guild_name!,world_name:primary.basic.world_name});guildKey=String(guild.oguild_id);await directStore.saveMeta("current-guild",{key:guildCacheKey,id:guildKey});}return api.request("guild/basic",{oguild_id:guildKey});};let roster;try{roster=await loadRoster();}catch(error){if(cachedGuild?.key!==guildCacheKey)throw error;guildKey="";roster=await loadRoster();}members=Array.isArray(roster.guild_member)?roster.guild_member.filter((name:unknown):name is string=>typeof name==="string"):[];}
    if(revision!==this.revision)throw new DOMException("설정 변경","AbortError");
    const targets=[...new Set([this.primary,...members,...this.favorites])].slice(0,MAX_TARGETS),rows:Snapshot[]=[],failed:string[]=[],historyDates=Array.from({length:30},(_,index)=>isoDay(index-30)),knownMembership=byName.get(this.primary)?.guildMembership,missingGuildDates=historyDates.filter(date=>knownMembership?.[date]===undefined),estimatedHistory=targets.reduce((sum,name)=>sum+(byName.get(name)?historyDates.filter(date=>!byName.get(name)!.history.some(item=>item.date===date)).length:30),0),totalWork=Math.max(1,targets.length+estimatedHistory+missingGuildDates.length+2);let overallDone=1,lastSnapshotAt=0;
    const knownIdentities=await directStore.identities(targets);knownIdentities.set(this.primary,{name:this.primary,ocid:primary.ocid,checkedAt:Date.now()});
    this.report({phase:"current",total:totalWork,completed:overallDone,progressPercent:Math.round(overallDone/totalWork*100),message:`현재 정보 ${targets.length}명을 조회합니다.`});
    await parallel(targets,async name=>{try{const value=name===this.primary?primary:await readCurrent(name,knownIdentities),old=byName.get(name)||previous.find(row=>row.ocid===value.ocid);let row:Snapshot={ocid:value.ocid,basic:value.basic,observedAt:new Date().toISOString(),history:old?.history||[],todayBaseline:old?.todayBaseline,isGuildMember:name===this.primary||members.includes(name),guildMembership:old?.guildMembership||null};if(old&&kstDate(new Date(old.observedAt))!==kstDate())row.todayBaseline=historyBasic(old.basic);row=mergeActivity(old,row,__EXP_TABLE__);rows.push(row);if(performance.now()-lastSnapshotAt>=250){lastSnapshotAt=performance.now();const live=new Map(previous.filter(item=>targets.includes(item.basic.character_name)).map(item=>[item.basic.character_name,item]));for(const item of rows)live.set(item.basic.character_name,item);this.send({type:"snapshot",rows:targets.map(target=>live.get(target)).filter(Boolean) as Snapshot[]});}}catch(error){if(error instanceof DOMException&&error.name==="AbortError")throw error;failed.push(name);}this.progress(++overallDone,failed.length);});
    const liveSuccesses=targets.length-failed.length;if(liveSuccesses===0)throw new Error("현재 캐릭터 정보를 한 명도 조회하지 못했습니다.");
    for(const name of failed){const old=byName.get(name);if(old)rows.push(old);}
    const currentAt=new Date().toISOString(),latestMs=Math.round(performance.now()-runStarted),apiMetrics=api.metrics();this.cacheRows=rows;this.send({type:"snapshot",rows});this.report({busy:true,phase:"saving",completed:overallDone,total:totalWork,progressPercent:Math.min(99,Math.round(overallDone/totalWork*100)),failed:failed.length,lastSuccessAt:currentAt,nextRefreshAt:new Date(Date.now()+REFRESH_MS).toISOString(),cachedCount:rows.length,metrics:{latestMs,totalMs:null,...apiMetrics},message:`현재 정보 ${liveSuccesses}명 표시 완료 · 최근 기록을 보충합니다.`});this.importAndroid(rows.map(row=>({...row,history:[]})),guildKey);await Promise.all([directStore.saveCurrent(rows),directStore.saveMeta("last-success",currentAt),directStore.saveMeta("active-ocids",rows.map(row=>row.ocid)),directStore.saveIdentities(identityUpdates)]);
    const membershipByDate=new Map<string,Set<string>>();
    const stages=[{label:"오늘 기준",dates:[isoDay(-1)]},{label:"최근 7일",dates:Array.from({length:6},(_,index)=>isoDay(index-7))},{label:"최근 30일",dates:Array.from({length:23},(_,index)=>isoDay(index-30))}];
    for(const stage of stages){const missingByRow=rows.map(row=>({row,dates:stage.dates.filter(date=>!row.history.some(item=>item.date===date))})).filter(item=>item.dates.length),historyTotal=missingByRow.reduce((sum,item)=>sum+item.dates.length,0);if(!historyTotal)continue;this.report({phase:"history",completed:overallDone,total:totalWork,progressPercent:Math.min(99,Math.round(overallDone/totalWork*100)),message:`${stage.label} 기록 ${historyTotal}건을 보충합니다.`});const writes:{ocid:string;points:Snapshot["history"]}[]=[];await parallel(missingByRow,async item=>{const added:Snapshot["history"]=[];for(const date of item.dates){try{const basic=await api.request("character/basic",{ocid:item.row.ocid,date}) as Basic,point={date,basic:historyBasic(basic)};item.row.history.push(point);added.push(point);}catch(error){if(error instanceof DOMException&&error.name==="AbortError")throw error;}this.progress(++overallDone);}item.row.history.sort((a,b)=>a.date.localeCompare(b.date));if(added.length)writes.push({ocid:item.row.ocid,points:added});});this.cacheRows=rows;this.send({type:"snapshot",rows});await directStore.saveHistories(writes);}
    if(guildKey){this.report({phase:"guild",message:"날짜별 길드 명단을 확인합니다."});await parallel(missingGuildDates,async date=>{try{const roster=await api.request("guild/basic",{oguild_id:guildKey,date});membershipByDate.set(date,new Set(Array.isArray(roster.guild_member)?roster.guild_member.filter((name:unknown):name is string=>typeof name==="string"):[]));}catch(error){if(error instanceof DOMException&&error.name==="AbortError")throw error;}this.progress(++overallDone);});}
    for(const row of rows){row.history.sort((a,b)=>a.date.localeCompare(b.date));if(guildKey){const membership:Record<string,boolean>={...(row.guildMembership||{})};for(const [date,names] of membershipByDate)membership[date]=names.has(row.basic.character_name);row.guildMembership=membership;}}
    this.report({phase:"saving",message:"조회 기록을 안전하게 저장합니다."});this.cacheRows=rows;await directStore.saveCurrent(rows);this.importAndroid(rows,guildKey);this.send({type:"snapshot",rows});this.report({busy:false,phase:"complete",completed:totalWork,total:totalWork,progressPercent:100,failed:failed.length,lastSuccessAt:currentAt,nextRefreshAt:new Date(Date.parse(currentAt)+REFRESH_MS).toISOString(),cachedCount:rows.length,metrics:{latestMs,totalMs:Math.round(performance.now()-runStarted),...api.metrics()},message:`직접 조회 완료 ${rows.length}명 · 실패 ${failed.length}명`});
   }catch(error){if(error instanceof DOMException&&error.name==="AbortError"){this.report({busy:false,phase:"idle",message:"변경된 설정으로 조회를 다시 준비합니다."});return;}const message=error instanceof Error?error.message:"직접 조회에 실패했습니다.";this.report({busy:false,phase:"idle",message});this.send({type:"error",message});}finally{if(this.controller===controller)this.controller=null;}
  };
  if(navigator.locks)await navigator.locks.request("maple-personal-refresh",{ifAvailable:true},async lock=>{if(lock)await execute();else this.report({message:"다른 탭에서 조회 중입니다."});});else await execute();
 }
}

const engine=new DirectEngine();
if(new URLSearchParams(location.search).has("engine")){
 addEventListener("message",event=>{const expected=decodeURIComponent(location.hash.slice(1));if(event.origin!==__DASHBOARD_ORIGIN__||event.source!==parent||event.data?.type!=="connect"||event.data.nonce!==expected||event.ports.length!==1)return;engine.connect(event.ports[0]);if(validConfiguration(event.data.configuration))event.ports[0].postMessage(event.data.configuration);},{once:true});
}

function Setup(){
 const [key,setKey]=useState(()=>readPersonal(KEY)||""),[confirmed,setConfirmed]=useState(readPersonal(CONFIRMED)==="1"),[message,setMessage]=useState("서비스 단계 키는 이 출처에서 NEXON으로만 전송됩니다."),[persistent,setPersistent]=useState<boolean|null>(null);
 useEffect(()=>{void navigator.storage?.persisted?.().then(setPersistent);},[]);
 async function save(){if(!key.trim()||!confirmed){setMessage("서비스 단계 키와 확인 항목을 입력해 주세요.");return;}if(window.AndroidDirect&&!window.AndroidDirect.storeServiceKeyOnDevice(key.trim())){setMessage("Android 보안 저장소에 키를 저장하지 못했습니다.");return;}writePersonal(KEY,key.trim());writePersonal(CONFIRMED,"1");const value=await navigator.storage?.persist?.();setPersistent(value??null);notifyControl();setMessage("서비스 키를 이 브라우저에 저장했습니다. 대시보드에서 자동 조회가 시작됩니다.");}
 const copyServiceUrl=async()=>{try{await navigator.clipboard.writeText(__DASHBOARD_ORIGIN__);setMessage("정식 서비스 주소를 복사했습니다.");}catch{setMessage(`정식 서비스 주소 ${__DASHBOARD_ORIGIN__}`);}};
 return <main className="personal-page embedded"><header><span className="section-kicker">PRIVATE DIRECT SYNC</span><h1>서비스 키 직접 조회</h1><p>키와 경험치 기록은 이 기기에만 저장됩니다.</p></header><section className="panel"><label>넥슨 서비스 단계 API 키<input name="password" type="password" autoComplete="current-password" value={key} onChange={event=>setKey(event.target.value)}/></label><label className="check"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>내 명의의 서비스 단계 키이며 다른 사람과 공유하지 않았습니다.</label><p className="muted">개발키는 지원하지 않습니다. 키 종류를 자동 판별하는 공식 API가 없어 전체 조회 중 반복적인 429가 발생하면 서비스 키 확인을 안내합니다.</p><label>서비스 애플리케이션 등록 URL<div className="copy-field"><input readOnly value={__DASHBOARD_ORIGIN__}/><button type="button" onClick={()=>void copyServiceUrl()}>복사</button></div></label><p className="muted">저장소 보호 {persistent===true?"유지 허용":persistent===false?"브라우저 정리 시 삭제될 수 있음":"확인 중"}</p><div className="actions"><button type="button" onClick={()=>void save()}>키 저장 및 자동 조회</button><button type="button" onClick={()=>{writePersonal(KEY,null);writePersonal(CONFIRMED,null);setKey("");setConfirmed(false);notifyControl();setMessage("저장된 키를 삭제했습니다.");}}>저장된 키 삭제</button></div><p role="status">{message}</p><a href="https://openapi.nexon.com/ko/guide/prepare-in-advance/" target="_blank" rel="noreferrer">서비스 키 발급 안내</a><p className="muted">사용자 본인 명의의 키만 입력하고 NEXON 약관을 확인해 주세요. 이 키는 대시보드나 우리 서버로 전달되지 않습니다. 사용자별 서비스 키 사용 방식은 NEXON의 명시적 허용 사례가 아니므로 공식 문의와 병행 운영합니다.</p></section><footer>Data based on NEXON Open API</footer></main>;
}

if(!new URLSearchParams(location.search).has("engine"))createRoot(document.getElementById("root")!).render(<Setup/>);
