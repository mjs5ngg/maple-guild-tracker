// 기존 공개 주소의 비민감 로컬 설정을 정식 도메인으로 한 번 이전합니다.
import {readLocalProfile,writeLocalProfile} from "./startSession";

const LEGACY_HOST="app.guildmate.workers.dev",PUBLIC_HOST="guildfollow.com",HASH_PREFIX="#profile-transfer=";

export function migrationUrl(current:URL,profile:{primary:string;favorites:string[]}){
 const next=new URL(current.toString());next.protocol="https:";next.host=PUBLIC_HOST;
 next.hash=`${HASH_PREFIX}${encodeURIComponent(JSON.stringify({profile,view:current.hash.slice(1)}))}`;
 return next.toString();
}

export function decodeMigration(hash:string){
 if(!hash.startsWith(HASH_PREFIX))return null;
 try{const value=JSON.parse(decodeURIComponent(hash.slice(HASH_PREFIX.length))) as {profile?:unknown;view?:unknown};return {profile:value.profile,view:typeof value.view==="string"?value.view:""};}catch{return null;}
}

export function migratePublicOrigin(){
 if(location.hostname===LEGACY_HOST){location.replace(migrationUrl(new URL(location.href),readLocalProfile()));return true;}
 if(location.hostname!==PUBLIC_HOST)return false;
 const transfer=decodeMigration(location.hash);if(!transfer)return false;
 writeLocalProfile(transfer.profile as {primary:string;favorites:string[]});
 const hash=["overview","guild","favorites","chase","settings"].includes(transfer.view)?`#${transfer.view}`:"";
 history.replaceState(null,"",`${location.pathname}${location.search}${hash}`);return false;
}
