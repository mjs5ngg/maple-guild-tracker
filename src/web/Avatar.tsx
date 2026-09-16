// 공개 웹 캐릭터 이미지를 확대하고 활동 중에는 PC와 같은 걷기 프레임을 재생합니다.
import {useEffect,useState} from "react";
import type {Snapshot} from "./types";

export const WALK_FRAMES=["A02.0","A02.1","A02.2","A02.3"];
export const WALK_INTERVAL_MS=180;
export const IDLE_FRAMES=["A00.0","A00.1","A00.2","A00.3"];
export const IDLE_INTERVAL_MS=650;
export function avatarUrl(image:string,frame:string){
 const url=new URL(image);
 url.searchParams.set("action",frame);
 url.searchParams.set("width","240");url.searchParams.set("height","240");url.searchParams.set("x","120");url.searchParams.set("y","170");
 return url.toString();
}
export function Avatar({character,idle=false}:{character:Snapshot;idle?:boolean}){
 const [frame,setFrame]=useState(0),[failed,setFailed]=useState(false),[ready,setReady]=useState(false),[renderEpoch,setRenderEpoch]=useState(0);
 const active=Boolean(character.isHunting),frames=active?WALK_FRAMES:idle?IDLE_FRAMES:["A00.0"],interval=active?WALK_INTERVAL_MS:IDLE_INTERVAL_MS;
 useEffect(()=>{setFailed(false);setFrame(0);setReady(frames.length===1);const image=character.basic.character_image;if(frames.length===1||!image)return;let cancelled=false;Promise.all(frames.map(value=>new Promise<void>(resolve=>{const preload=new Image();preload.onload=()=>{void preload.decode?.().catch(()=>{}).finally(resolve);};preload.onerror=()=>resolve();preload.src=avatarUrl(image,value);}))).then(()=>{if(!cancelled)setReady(true);});return()=>{cancelled=true;};},[character.basic.character_image,active,idle]);
 useEffect(()=>{if(frames.length===1||!ready){setFrame(0);return;}const timer=window.setInterval(()=>{if(document.visibilityState!=="hidden")setFrame(value=>(value+1)%frames.length);},interval);return()=>window.clearInterval(timer);},[active,idle,ready]);
 useEffect(()=>{const restore=()=>{if(document.visibilityState==="hidden")return;setFailed(false);setFrame(0);setRenderEpoch(value=>value+1);};document.addEventListener("visibilitychange",restore);window.addEventListener("pageshow",restore);window.addEventListener("focus",restore);return()=>{document.removeEventListener("visibilitychange",restore);window.removeEventListener("pageshow",restore);window.removeEventListener("focus",restore);};},[]);
 const image=character.basic.character_image;
 return <div className={`character-avatar ${active?"walking":idle?"idle":""}`}>{image&&!failed?<img key={`${image}-${renderEpoch}`} src={avatarUrl(image,frames[frame]||frames[0])} alt={`${character.basic.character_name} 캐릭터`} onError={()=>setFailed(true)}/>:<span>{character.basic.character_name.slice(0,1)}</span>}</div>;
}
