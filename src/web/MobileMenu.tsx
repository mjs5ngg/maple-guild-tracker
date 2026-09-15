// 모바일 공개 웹의 우측 드로어 탐색과 화면 도구를 제공합니다.
import {useEffect,type ComponentType,type ReactNode} from "react";
import {X} from "lucide-react";

export interface MobileMenuItem<T extends string>{key:T;label:string;Icon:ComponentType}

export default function MobileMenu<T extends string>({open,active,items,onNavigate,onClose,children}:{open:boolean;active:T|"settings";items:MobileMenuItem<T>[];onNavigate:(key:T)=>void;onClose:()=>void;children:ReactNode}){
 useEffect(()=>{if(!open)return;const close=(event:KeyboardEvent)=>{if(event.key==="Escape")onClose();};addEventListener("keydown",close);return()=>removeEventListener("keydown",close);},[open,onClose]);
 useEffect(()=>{document.body.classList.toggle("mobile-menu-open",open);return()=>document.body.classList.remove("mobile-menu-open");},[open]);
 if(!open)return null;
 return <div className="mobile-menu-layer"><button className="mobile-menu-backdrop" aria-label="모바일 메뉴 닫기" onClick={onClose}/><aside className="mobile-menu-drawer" role="dialog" aria-modal="true" aria-labelledby="mobile-menu-title"><header><div><small>MENU</small><b id="mobile-menu-title">길드원 따라가기</b></div><button className="icon-button" aria-label="메뉴 닫기" onClick={onClose}><X/></button></header><nav>{items.map(({key,label,Icon})=><button key={key} className={active===key?"active":""} onClick={()=>{onNavigate(key);onClose();}}><Icon/><span>{label}</span></button>)}</nav><div className="mobile-menu-tools">{children}</div><footer>Data based on NEXON Open API</footer></aside></div>;
}
