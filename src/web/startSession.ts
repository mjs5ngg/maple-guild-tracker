// 로그인 설정과 브라우저 로컬 설정을 D1 쓰기 없이 합쳐 불러옵니다.
export type SessionProfile={primary:string;favorites:string[];signedIn:boolean;unreachable?:boolean;unsynced?:boolean};
const LOCAL_PROFILE_KEY="web-local-profile-v1";

function normalize(value:unknown):Omit<SessionProfile,"signedIn">{
 const row=value&&typeof value==="object"?value as Record<string,unknown>:{};
 const primary=typeof row.primary==="string"?row.primary.trim():"";
 const favorites=Array.isArray(row.favorites)?[...new Set(row.favorites.filter((name):name is string=>typeof name==="string").map(name=>name.trim()).filter(Boolean))].slice(0,30):[];
 return {primary,favorites};
}
export function readLocalProfile():Omit<SessionProfile,"signedIn">{
 try{return normalize(JSON.parse(localStorage.getItem(LOCAL_PROFILE_KEY)||"{}"));}catch{return {primary:"",favorites:[]};}
}
export function writeLocalProfile(value:{primary:string;favorites:string[]}){
 const normalized=normalize(value);try{localStorage.setItem(LOCAL_PROFILE_KEY,JSON.stringify(normalized));}catch{/* 현재 탭에서는 계속 사용할 수 있습니다. */}return normalized;
}
// 계정에 아직 보내지 못한 설정 변경입니다. 앱이 종료·업데이트돼도 남아 있다가 다음 실행 때 먼저 올립니다.
const UNSENT_PROFILE_KEY="web-profile-unsent-v1";
export function readUnsentProfile():{primary:string;favorites:string[]}|null{
 try{const raw=localStorage.getItem(UNSENT_PROFILE_KEY);return raw?normalize(JSON.parse(raw)):null;}catch{return null;}
}
function writeUnsentProfile(value:{primary:string;favorites:string[]}|null){
 try{if(value)localStorage.setItem(UNSENT_PROFILE_KEY,JSON.stringify(normalize(value)));else localStorage.removeItem(UNSENT_PROFILE_KEY);}catch{/* 저장이 막히면 현재 실행 중에만 보관합니다. */}
}
// 화면에서 바꾼 설정은 로그인 확인 여부와 관계없이 로컬과 미전송 기록에 함께 남겨, 나중에 서버 값이 덮어쓰지 못하게 합니다.
export function recordLocalChange(value:{primary:string;favorites:string[]}){const normalized=writeLocalProfile(value);writeUnsentProfile(normalized);return normalized;}
export async function startSession(api:(path:string,body?:unknown)=>Promise<Record<string,any>>):Promise<SessionProfile>{
 const local=readLocalProfile();
 let remote:Record<string,any>;
 // 연결 실패는 로그아웃이 아니므로 표시해 두고, 호출한 쪽이 로그인 흔적을 지우지 않게 합니다.
 try{remote=await api("/api/me");}catch{return {...local,signedIn:false,unreachable:true};}
 const profile=normalize(remote);
 if(!remote.signedIn)return {...local,signedIn:false};
 // 보내지 못한 변경이 있으면 서버 값으로 덮어쓰지 않고 먼저 올립니다. 실패해도 기기 값을 유지하고 다음 기회에 다시 보냅니다.
 const unsent=readUnsentProfile();
 if(unsent){
  const next={primary:unsent.primary||profile.primary,favorites:unsent.favorites};
  if(sameProfile(next,profile)){writeUnsentProfile(null);return {...writeLocalProfile(profile),signedIn:true};}
  if(next.primary){
   writeUnsentProfile(next);
   try{await api("/api/profile",next);}catch{return {...writeLocalProfile(next),signedIn:true,unsynced:true};}
   writeUnsentProfile(null);return {...writeLocalProfile(next),signedIn:true};
  }
 }
 if(!profile.primary&&!profile.favorites.length&&(local.primary||local.favorites.length)){
  try{await api("/api/profile",local);}catch{writeUnsentProfile(local);return {...local,signedIn:true,unsynced:true};}
  return {...writeLocalProfile(local),signedIn:true};
 }
 return {...writeLocalProfile(profile),signedIn:true};
}

// 다른 기기의 변경은 화면 복귀 때 이 간격이 지났을 때만 다시 읽어 Worker 요청을 아낍니다.
export const ACCOUNT_REFRESH_MS=5*60_000;
export function shouldRefreshAccount(lastFetchedAt:number,now=Date.now()){return now-lastFetchedAt>=ACCOUNT_REFRESH_MS;}
export function sameProfile(left:{primary:string;favorites:string[]},right:{primary:string;favorites:string[]}){
 const a=normalize(left),b=normalize(right);
 return a.primary===b.primary&&JSON.stringify([...a.favorites].sort())===JSON.stringify([...b.favorites].sort());
}
// 로그인 복귀 뒤 첫 화면에서 /api/me를 확인하도록 표시합니다. 로그아웃 상태 방문자는 이 표시가 없어 D1을 읽지 않습니다.
export function markAccountLoginPending(){try{localStorage.setItem("web-account-hint","1");}catch{/* 로그인 후 새로고침하면 다시 확인합니다. */}}
// 즐겨찾기 연속 변경을 모아 마지막 값만 보내고, 이미 보낸 값과 같으면 보내지 않습니다.
export function createProfileSync(send:(profile:{primary:string;favorites:string[]})=>Promise<unknown>,delay=2000){
 let synced:{primary:string;favorites:string[]}|null=null,pending:{primary:string;favorites:string[]}|null=null,timer:ReturnType<typeof setTimeout>|null=null;
 async function flush(){
  if(timer){clearTimeout(timer);timer=null;}
  const next=pending;pending=null;
  if(!next||synced&&sameProfile(synced,next)){if(next)writeUnsentProfile(null);return false;}
  try{await send(next);}catch(error){if(!pending)pending=next;throw error;}
  synced=normalize(next);if(!pending)writeUnsentProfile(null);return true;
 }
 return {
  markSynced(profile:{primary:string;favorites:string[]}){synced=normalize(profile);},
  schedule(profile:{primary:string;favorites:string[]},onError?:(error:unknown)=>void){
   pending=normalize(profile);writeUnsentProfile(pending);if(timer)clearTimeout(timer);
   timer=setTimeout(()=>{void flush().catch(error=>onError?.(error));},delay);
  },
  async sendNow(profile:{primary:string;favorites:string[]}){pending=normalize(profile);writeUnsentProfile(pending);return flush();},
  hasPending(){return pending!==null;},
  flush,
 };
}
