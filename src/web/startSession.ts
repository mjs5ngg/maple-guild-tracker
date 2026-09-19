// 로그인 설정과 브라우저 로컬 설정을 D1 쓰기 없이 합쳐 불러옵니다.
export type SessionProfile={primary:string;favorites:string[];signedIn:boolean;unreachable?:boolean};
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
export async function startSession(api:(path:string,body?:unknown)=>Promise<Record<string,any>>):Promise<SessionProfile>{
 const local=readLocalProfile();
 try{
  const remote=await api("/api/me"),profile={...normalize(remote),signedIn:Boolean(remote.signedIn)};
  if(!profile.signedIn)return {...local,signedIn:false};
  if(!profile.primary&&!profile.favorites.length&&(local.primary||local.favorites.length)){
   await api("/api/profile",local);return {...writeLocalProfile(local),signedIn:true};
  }
  return {...writeLocalProfile(profile),signedIn:true};
 // 연결 실패는 로그아웃이 아니므로 표시해 두고, 호출한 쪽이 로그인 흔적을 지우지 않게 합니다.
 }catch{return {...local,signedIn:false,unreachable:true};}
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
  if(!next||synced&&sameProfile(synced,next))return false;
  await send(next);synced=normalize(next);return true;
 }
 return {
  markSynced(profile:{primary:string;favorites:string[]}){synced=normalize(profile);},
  schedule(profile:{primary:string;favorites:string[]},onError?:(error:unknown)=>void){
   pending=normalize(profile);if(timer)clearTimeout(timer);
   timer=setTimeout(()=>{void flush().catch(error=>onError?.(error));},delay);
  },
  async sendNow(profile:{primary:string;favorites:string[]}){pending=normalize(profile);return flush();},
  flush,
 };
}
