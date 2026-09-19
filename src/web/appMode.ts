// Android 앱에 내장된 화면인지와 그때 쓸 서버 주소·세션 토큰을 한곳에서 정합니다.
declare global {
 const __APP__:boolean|undefined;
 const __API_ORIGIN__:string|undefined;
 const __DIRECT_PATH__:string|undefined;
 interface Window { AndroidAuth?:{startGoogleLogin:()=>void;sessionToken?:()=>string;clearSession?:()=>void} }
}

export const APP_MODE=typeof __APP__!=="undefined"&&__APP__===true;
export const API_ORIGIN=APP_MODE&&typeof __API_ORIGIN__==="string"?__API_ORIGIN__:"";
export const DIRECT_PATH=typeof __DIRECT_PATH__==="string"?__DIRECT_PATH__:"";
export const PUBLIC_SITE="https://guildfollow.com";

export function apiUrl(path:string){return `${API_ORIGIN}${path}`;}
// 앱에서는 교차 출처라 쿠키가 전달되지 않으므로 네이티브에 보관된 세션을 Bearer로 보냅니다.
export function appAuthHeaders():Record<string,string>{
 if(!APP_MODE)return {};
 let token="";try{token=window.AndroidAuth?.sessionToken?.()||"";}catch{/* 브리지가 없으면 익명으로 계속합니다. */}
 return token?{authorization:`Bearer ${token}`}:{};
}
export function clearAppSession(){try{window.AndroidAuth?.clearSession?.();}catch{/* 앱 밖에서는 할 일이 없습니다. */}}
