// 기기 또는 로그인 세션을 준비한 뒤 해당 설정을 불러옵니다.
export async function startSession(api:(path:string,body?:unknown)=>Promise<Record<string,any>>){
 await api("/api/device",{});
 return api("/api/me");
}
