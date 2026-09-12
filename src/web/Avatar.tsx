// 공개 웹 캐릭터 이미지를 확대하고 활동 중에는 걷기 프레임을 왕복 재생합니다.
import {useEffect,useState} from "react";
import type {Snapshot} from "./types";

const WALK_FRAMES=["A02.0","A02.1","A02.2","A02.1"];
export function avatarUrl(image:string,frame:string){
 const url=new URL(image);
 url.searchParams.set("action",frame);
 url.searchParams.set("width","240");url.searchParams.set("height","240");url.searchParams.set("x","120");url.searchParams.set("y","170");
 return url.toString();
}
export function Avatar({character}:{character:Snapshot}){
 const [frame,setFrame]=useState(0),[failed,setFailed]=useState(false);
 const active=Boolean(character.isHunting);
 useEffect(()=>{setFailed(false);setFrame(0);},[character.basic.character_image]);
 useEffect(()=>{if(!active){setFrame(0);return;}const timer=window.setInterval(()=>{if(document.visibilityState!=="hidden")setFrame(value=>(value+1)%WALK_FRAMES.length);},220);return()=>window.clearInterval(timer);},[active]);
 const image=character.basic.character_image;
 return <div className={`character-avatar ${active?"walking":""}`}>{image&&!failed?<img src={avatarUrl(image,active?WALK_FRAMES[frame]:"A00.0")} alt={`${character.basic.character_name} 캐릭터`} onError={()=>setFailed(true)}/>:<span>{character.basic.character_name.slice(0,1)}</span>}</div>;
}
