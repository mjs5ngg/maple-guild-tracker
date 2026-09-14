// 로그인 설정과 브라우저 로컬 설정을 D1 쓰기 없이 합쳐 불러옵니다.
export type SessionProfile={primary:string;favorites:string[];signedIn:boolean};
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
 }catch{return {...local,signedIn:false};}
}
