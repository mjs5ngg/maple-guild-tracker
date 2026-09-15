// 웹 대시보드와 개인 키 화면을 서로 다른 빌드 및 출처로 분리합니다.
import {defineConfig,loadEnv} from "vite";
import {webOrigins} from "./scripts/web-origins";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import fs from "node:fs";
import path from "node:path";
const adHost=process.env.WEB_AD_HOST==="1",direct=!adHost&&process.env.WEB_DIRECT==="1",target=adHost?"ads":direct?"direct":"dashboard";
const root=`web/${target}`;
const rust=fs.readFileSync("src-tauri/src/exp.rs","utf8");
const table=rust.match(/const EXP_200_TO_299:[\s\S]*?= \[([\s\S]*?)\];/)?.[1].split(",").map(v=>v.trim().replaceAll("_","")).filter(Boolean);
if(table?.length!==100) throw new Error("경험치표를 확인하세요.");
export default defineConfig(({mode,command})=>{
const productionDefaults=command==="build"?{
 PUBLIC_ORIGIN:process.env.PUBLIC_ORIGIN||"https://app.guildmate.workers.dev",
 WEB_DASHBOARD_ORIGIN:process.env.WEB_DASHBOARD_ORIGIN||process.env.PUBLIC_ORIGIN||"https://app.guildmate.workers.dev",
 WEB_DIRECT_ORIGIN:process.env.WEB_DIRECT_ORIGIN||"https://maple-exp-personal.pages.dev",
 WEB_AD_HOST_ORIGIN:process.env.WEB_AD_HOST_ORIGIN||"https://maple-exp-ads.pages.dev"
}:{};
const env={...loadEnv(mode,process.cwd(),""),...process.env,...productionDefaults};
const {dashboardOrigin,directOrigin}=webOrigins(env);
const sizes={desktopLeft:[160,600],desktopRight:[160,600],desktopBottom:[728,90],mobileBottom:[300,50]} as const;
const adUnit=(prefix:string,size:readonly [number,number])=>{const encoded=String(env[`${prefix}_TAG_B64`]||"").trim();if(!encoded)return null;if(encoded.length>32_768||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))throw new Error(`${prefix} 광고 태그 인코딩을 확인하세요.`);const html=Buffer.from(encoded,"base64").toString("utf8").trim();if(!html.startsWith("<")||html.length>24_000)throw new Error(`${prefix} 광고 태그 내용을 확인하세요.`);return {html,width:size[0],height:size[1]};};
const advertica={desktopLeft:adUnit("WEB_ADVERTICA_DESKTOP_LEFT",sizes.desktopLeft),desktopRight:adUnit("WEB_ADVERTICA_DESKTOP_RIGHT",sizes.desktopRight),desktopBottom:adUnit("WEB_ADVERTICA_DESKTOP_BOTTOM",sizes.desktopBottom),mobileBottom:adUnit("WEB_ADVERTICA_MOBILE_BOTTOM",sizes.mobileBottom)};
let affiliates=[];try{affiliates=env.WEB_AFFILIATE_CARDS_JSON?JSON.parse(String(env.WEB_AFFILIATE_CARDS_JSON)):[];}catch{throw new Error("WEB_AFFILIATE_CARDS_JSON 형식을 확인하세요.");}
const adHostOrigin=String(env.WEB_AD_HOST_ORIGIN||"").replace(/\/$/,"");
const monetization=direct||adHost?{ads:{desktopLeft:false,desktopRight:false,desktopBottom:false,mobileBottom:false},adHostOrigin:"",affiliates:[]}:{ads:Object.fromEntries(Object.entries(advertica).map(([name,value])=>[name,Boolean(value)])),adHostOrigin,affiliates};
const localProxy={target:"http://127.0.0.1:3100",changeOrigin:true};
const proxyOrigin=process.env.WEB_PROXY_ORIGIN||dashboardOrigin;
const localOrigin={name:"local-api-origin",configureServer(server:any){server.middlewares.use((request:any,_response:any,next:any)=>{if(request.url?.startsWith("/api/")||request.url?.startsWith("/auth/"))request.headers.origin=proxyOrigin;next();});}};
return {
 root,plugins:[react(),tailwindcss(),...direct||adHost?[]:[localOrigin]],
 define:{"__EXP_TABLE__":JSON.stringify(table),"__DASHBOARD_ORIGIN__":JSON.stringify(dashboardOrigin),"__DIRECT_ORIGIN__":JSON.stringify(directOrigin),"__MONETIZATION__":JSON.stringify(monetization),"__ADVERTICA__":JSON.stringify(adHost?advertica:{})},
 resolve:{alias:{"/src":path.resolve("src")}},
 build:{outDir:path.resolve("web-dist",target),emptyOutDir:true},
 server:{host:"127.0.0.1",port:adHost?3104:direct?3101:3102,strictPort:true,fs:{allow:[process.cwd()]},proxy:direct||adHost?undefined:{"/api":localProxy,"/auth":localProxy},
 headers:direct?{"Content-Security-Policy":"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:3101 https://open.api.nexon.com; img-src 'self' https://open.api.nexon.com data:; frame-ancestors http://127.0.0.1:3102 https://app.guildmate.workers.dev; base-uri 'none'","Referrer-Policy":"no-referrer"}:{}},
 preview:{host:"127.0.0.1",port:direct?3101:3102,strictPort:true}
};});
