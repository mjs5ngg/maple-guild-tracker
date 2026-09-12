// 캐릭터 설정과 로그인 및 계정 관리를 순위 화면과 분리된 대화상자로 제공합니다.
import * as Dialog from "@radix-ui/react-dialog";
import {HelpCircle,LogIn,Save,Trash2,X} from "lucide-react";

declare global { interface Window { AndroidAuth?:{startGoogleLogin:()=>void} } }

type Provider={name:string;configured:boolean};
export default function SettingsDialog({open,onOpenChange,primary,setPrimary,favorites,setFavorites,signedIn,providers,onSave,onLogout,onDelete}:{open:boolean;onOpenChange:(value:boolean)=>void;primary:string;setPrimary:(value:string)=>void;favorites:string;setFavorites:(value:string)=>void;signedIn:boolean;providers:Provider[];onSave:()=>void;onLogout:()=>void;onDelete:()=>void}){
 return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="dialog-overlay"/><Dialog.Content className="dialog-content"><div className="dialog-titlebar"><div><span className="section-kicker">SETTINGS</span><Dialog.Title>내 캐릭터 설정</Dialog.Title><Dialog.Description>로그인하지 않아도 모든 조회 기능을 사용할 수 있습니다.</Dialog.Description></div><Dialog.Close className="icon-button" aria-label="설정 닫기"><X/></Dialog.Close></div>
  <label className="field">대표캐릭터<input value={primary} onChange={event=>setPrimary(event.target.value)} maxLength={20} placeholder="캐릭터 닉네임"/></label>
  <label className="field">즐겨찾기 · 최대 30명<textarea value={favorites} onChange={event=>setFavorites(event.target.value)} placeholder="한 줄에 한 캐릭터"/></label>
  <button className="primary-button" onClick={onSave}><Save/>설정 저장</button>
  <div className="notice"><HelpCircle/><p>마지막 이용 후 168시간이 지나면 나만 필요로 하는 대상의 공용 수집이 멈춥니다. 자정 근처 경험치는 API 날짜 경계 때문에 오전 2시 이후 재정렬될 수 있습니다.</p></div>
  <div className="account-box"><div><b>{signedIn?"기기 간 설정 동기화 중":"기기 간 동기화"}</b><p>{signedIn?"Google 계정에 연결된 설정을 사용합니다.":"로그인은 PC·모바일 간 설정 동기화에만 필요합니다."}</p></div>{signedIn?<button className="quiet-button" onClick={onLogout}>로그아웃</button>:providers.filter(provider=>provider.name==="google").map(provider=><button key={provider.name} className="quiet-button" disabled={!provider.configured} onClick={()=>{if(window.AndroidAuth)window.AndroidAuth.startGoogleLogin();else location.href=`/auth/${provider.name}/start`;}}><LogIn/>Google 로그인{!provider.configured&&" · 준비 중"}</button>)}</div>
  {signedIn&&<button className="danger-button" onClick={onDelete}><Trash2/>계정 탈퇴</button>}
 </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
