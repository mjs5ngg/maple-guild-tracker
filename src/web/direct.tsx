// 서비스 키를 격리 보관하고 사용자 기기에서 길드 기록을 직접 수집합니다.
import {useEffect,useState} from "react";
import {createRoot} from "react-dom/client";
import {mergeActivity,parseNexon,kstDate} from "./experience";
import type {Basic,Snapshot} from "./types";
import type {DashboardToDirect,DirectStatus,DirectToDashboard} from "./directProtocol";
import {validConfiguration,validDashboardMessage} from "./directProtocol";
import {directStore} from "./directStore";
import {readPersonal,writePersonal} from "./personalStorage";
import "./web.css";

declare global {interface Window {AndroidDirect?:{storeServiceKeyOnDevice:(value:string)=>boolean;importSnapshots:(payload:string)=>boolean}}}

const KEY="maple-personal-key",CONFIRMED="maple-service-confirmed",REFRESH_MS=15*60*1000,IDENTITY_MS=24*60*60*1000;
const MAX_TARGETS=1000,MAX_DAILY_REQUESTS=200_000,CONCURRENCY=32;
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const isoDay=(offset:number)=>{const value=new Date(`${kstDate()}T00:00:00Z`);value.setUTCDate(value.getUTCDate()+offset);return value.toISOString().slice(0,10);};
const notifyControl=()=>{if("BroadcastChannel" in window){const channel=new BroadcastChannel("maple-personal-control");channel.postMessage("key-changed");channel.close();}};

class NexonClient{
 private nextSlot=0;private interval=10;private requestCount=0;private requestDay=kstDate();
 constructor(private key:string){}
 async initialize(){const saved=await directStore.meta<{date:string;count:number}>("request-budget");if(saved?.date===this.requestDay)this.requestCount=saved.count;}
 private async pace(){const now=Date.now(),slot=Math.max(now,this.nextSlot);this.nextSlot=slot+this.interval;if(slot>now)await delay(slot-now);}
 async request(path:string,params:Record<string,string>):Promise<any>{
  for(let attempt=0;attempt<4;attempt++){
   if(this.requestDay!==kstDate()){this.requestDay=kstDate();this.requestCount=0;}
   if(this.requestCount>=MAX_DAILY_REQUESTS)throw new Error("이 기기의 일일 안전 조회 한도에 도달했습니다.");
   await this.pace();this.requestCount++;if(this.requestCount%100===0)void directStore.saveMeta("request-budget",{date:this.requestDay,count:this.requestCount});
   const url=new URL(`https://open.api.nexon.com/maplestory/v1/${path}`);url.search=new URLSearchParams(params).toString();
   const response=await fetch(url,{headers:{"x-nxopen-api-key":this.key},credentials:"omit",referrerPolicy:"no-referrer",signal:AbortSignal.timeout(20_000)});
   if(response.ok){this.interval=Math.max(10,this.interval-.25);return parseNexon(await response.text());}
   if((response.status===429||response.status>=500)&&attempt<3){if(response.status===429)this.interval=Math.min(80,this.interval*2);await delay(700*2**attempt+Math.random()*300);continue;}
   if(response.status===429)throw new Error("호출 한도에 도달했습니다. 서비스 단계 키인지 확인해 주세요.");
   throw new Error("NEXON API 응답을 확인해 주세요.");
  }
  throw new Error("NEXON API 재시도 횟수를 초과했습니다.");
 }
}

async function parallel<T>(values:T[],work:(value:T,index:number)=>Promise<void>){let cursor=0;const runner=async()=>{while(cursor<values.length){const index=cursor++;await work(values[index],index);}};await Promise.all(Array.from({length:Math.min(CONCURRENCY,values.length)},runner));}

class DirectEngine{
 private port:MessagePort|null=null;private primary="";private favorites:string[]=[];private automatic=false;private timer=0;private running:Promise<void>|null=null;
 private status:DirectStatus={keyStored:Boolean(readPersonal(KEY)),serviceConfirmed:readPersonal(CONFIRMED)==="1",busy:false,completed:0,total:0,failed:0,lastSuccessAt:null,nextRefreshAt:null,cachedCount:0,storagePersistent:null,message:"서비스 키를 설정해 주세요."};
 connect(port:MessagePort){this.port=port;port.onmessage=event=>this.receive(event.data);port.start();void this.loadCache();this.arm();}
 private send(value:DirectToDashboard){this.port?.postMessage(value);}
 private importAndroid(rows:Snapshot[],guildKey:string){if(!window.AndroidDirect)return;try{window.AndroidDirect.importSnapshots(JSON.stringify({primary:this.primary,favorites:this.favorites,guildKey,rows}));}catch{/* Android 네이티브 저장 실패는 웹 직접 조회를 막지 않습니다. */}}
 private report(patch:Partial<DirectStatus>={}){this.status={...this.status,...patch};this.send({type:"status",status:this.status});}
 private async loadCache(){let rows=await directStore.snapshots();const active=await directStore.meta<string[]>("active-ocids"),last=await directStore.meta<string>("last-success"),persistent=await navigator.storage?.persisted?.();if(active?.length){const selected=new Set(active);rows=rows.filter(row=>selected.has(row.ocid));}this.report({cachedCount:rows.length,lastSuccessAt:last||null,nextRefreshAt:last?new Date(Date.parse(last)+REFRESH_MS).toISOString():null,storagePersistent:persistent??null});if(rows.length)this.send({type:"snapshot",rows});}
 private receive(value:unknown){
  if(!validDashboardMessage(value))return;
  if(validConfiguration(value)){this.primary=value.primary.trim();this.favorites=[...new Set(value.favorites.map(name=>name.trim()).filter(Boolean))].slice(0,30);this.automatic=value.automatic;void this.refreshIfDue();}
  else if(value?.type==="refresh")void this.refresh(true);
  else if(value?.type==="delete-key"){writePersonal(KEY,null);writePersonal(CONFIRMED,null);this.report({keyStored:false,serviceConfirmed:false,nextRefreshAt:null,message:"저장된 키를 삭제했습니다."});}
 }
 private arm(){window.clearInterval(this.timer);this.timer=window.setInterval(()=>void this.refreshIfDue(),60_000);for(const event of ["online","pageshow"] as const)addEventListener(event,()=>void this.refreshIfDue());document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")void this.refreshIfDue();});if("BroadcastChannel" in window)new BroadcastChannel("maple-personal-control").onmessage=()=>{this.report({keyStored:Boolean(readPersonal(KEY)),serviceConfirmed:readPersonal(CONFIRMED)==="1"});if(this.running){const active=this.running;void active.then(()=>this.refresh(true));}else void this.refresh(true);};}
 private async refreshIfDue(){if(!this.automatic||!this.primary)return;const last=await directStore.meta<string>("last-success");if(!last||Date.now()-Date.parse(last)>=REFRESH_MS)void this.refresh(false);}
 refresh(manual:boolean){if(this.running)return this.running;this.running=this.run(manual).finally(()=>{this.running=null;});return this.running;}
 private async run(manual:boolean){
  const key=readPersonal(KEY)||"";if(!key||readPersonal(CONFIRMED)!=="1"){this.report({keyStored:Boolean(key),serviceConfirmed:false,message:"서비스 단계 API 키를 설정해 주세요."});return;}
  const execute=async()=>{
   this.report({busy:true,completed:0,total:0,failed:0,message:manual?"수동 조회를 시작합니다.":"자동 조회를 시작합니다."});
   try{
    const api=new NexonClient(key);await api.initialize();const previous=await directStore.snapshots(),byName=new Map(previous.map(row=>[row.basic.character_name,row]));
    const readCurrent=async(name:string)=>{
     let identity=await directStore.identity(name),ocid=identity?.ocid;
     if(!identity||Date.now()-identity.checkedAt>=IDENTITY_MS){const found=await api.request("id",{character_name:name});ocid=String(found.ocid);await directStore.saveIdentity({name,ocid,checkedAt:Date.now()});}
     try{const basic=await api.request("character/basic",{ocid:ocid!}) as Basic;return {ocid:ocid!,basic};}
     catch{await directStore.deleteIdentity(name);const found=await api.request("id",{character_name:name});ocid=String(found.ocid);await directStore.saveIdentity({name,ocid,checkedAt:Date.now()});return {ocid,basic:await api.request("character/basic",{ocid}) as Basic};}
    };
    const primary=await readCurrent(this.primary);let guildKey="",members:string[]=[];
    if(primary.basic.character_guild_name){const guild=await api.request("guild/id",{guild_name:primary.basic.character_guild_name,world_name:primary.basic.world_name});guildKey=String(guild.oguild_id);const roster=await api.request("guild/basic",{oguild_id:guildKey});members=Array.isArray(roster.guild_member)?roster.guild_member.filter((name:unknown):name is string=>typeof name==="string"):[];}
    const targets=[...new Set([this.primary,...members,...this.favorites])].slice(0,MAX_TARGETS),rows:Snapshot[]=[],failed:string[]=[];
    this.report({total:targets.length,message:`현재 정보 ${targets.length}명을 조회합니다.`});
    await parallel(targets,async name=>{try{const value=name===this.primary?primary:await readCurrent(name),old=byName.get(name)||previous.find(row=>row.ocid===value.ocid);let row:Snapshot={ocid:value.ocid,basic:value.basic,observedAt:new Date().toISOString(),history:old?.history||[],todayBaseline:old?.todayBaseline,isGuildMember:name===this.primary||members.includes(name),guildMembership:old?.guildMembership||null};if(old&&kstDate(new Date(old.observedAt))!==kstDate())row.todayBaseline=old.basic;row=mergeActivity(old,row,__EXP_TABLE__);rows.push(row);await directStore.saveSnapshot(row);}catch{failed.push(name);}this.report({completed:this.status.completed+1,failed:failed.length});});
    const liveSuccesses=targets.length-failed.length;if(liveSuccesses===0)throw new Error("현재 캐릭터 정보를 한 명도 조회하지 못했습니다.");
    for(const name of failed){const old=byName.get(name);if(old)rows.push(old);}
    const currentAt=new Date().toISOString();await directStore.saveMeta("last-success",currentAt);await directStore.saveMeta("active-ocids",rows.map(row=>row.ocid));this.importAndroid(rows,guildKey);this.send({type:"snapshot",rows});this.report({busy:true,completed:liveSuccesses,total:targets.length,failed:failed.length,lastSuccessAt:currentAt,nextRefreshAt:new Date(Date.now()+REFRESH_MS).toISOString(),cachedCount:rows.length,message:`현재 정보 ${liveSuccesses}명 표시 완료 · 최근 기록을 보충합니다.`});
    const historyDates=Array.from({length:30},(_,index)=>isoDay(index-30)),membershipByDate=new Map<string,Set<string>>(),knownMembership=byName.get(this.primary)?.guildMembership;
    const missingGuildDates=historyDates.filter(date=>knownMembership?.[date]===undefined);
    if(guildKey)await parallel(missingGuildDates,async date=>{try{const roster=await api.request("guild/basic",{oguild_id:guildKey,date});membershipByDate.set(date,new Set(Array.isArray(roster.guild_member)?roster.guild_member.filter((name:unknown):name is string=>typeof name==="string"):[]));}catch{/* 날짜별 명단 누락은 계산에서 구분합니다. */}});
    const missingByRow=rows.map(row=>({row,dates:historyDates.filter(date=>!row.history.some(item=>item.date===date))})).filter(item=>item.dates.length),historyTotal=missingByRow.reduce((sum,item)=>sum+item.dates.length,0);
    if(historyTotal){this.report({completed:0,total:historyTotal,message:`최근 30일 기록 ${historyTotal}건을 보충합니다.`});let done=0;await parallel(missingByRow,async item=>{for(const date of item.dates){try{const basic=await api.request("character/basic",{ocid:item.row.ocid,date}) as Basic;item.row.history.push({date,basic});}catch{/* 누락은 0으로 만들지 않습니다. */}done++;this.report({completed:done});}item.row.history.sort((a,b)=>a.date.localeCompare(b.date));await directStore.saveSnapshot(item.row);});}
    for(const row of rows){row.history.sort((a,b)=>a.date.localeCompare(b.date));if(guildKey){const membership:Record<string,boolean>={...(row.guildMembership||{})};for(const [date,names] of membershipByDate)membership[date]=names.has(row.basic.character_name);row.guildMembership=membership;}await directStore.saveSnapshot(row);}
    this.importAndroid(rows,guildKey);this.send({type:"snapshot",rows});this.report({busy:false,completed:rows.length,total:rows.length,failed:failed.length,lastSuccessAt:currentAt,nextRefreshAt:new Date(Date.parse(currentAt)+REFRESH_MS).toISOString(),cachedCount:rows.length,message:`직접 조회 완료 ${rows.length}명 · 실패 ${failed.length}명`});
   }catch(error){const message=error instanceof Error?error.message:"직접 조회에 실패했습니다.";this.report({busy:false,message});this.send({type:"error",message});}
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
