// 웹 대시보드와 개인 키 화면을 서로 다른 빌드 및 출처로 분리합니다.
import {defineConfig,loadEnv} from "vite";
import {webOrigins} from "./scripts/web-origins";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import fs from "node:fs";
import path from "node:path";
const direct=process.env.WEB_DIRECT==="1";
const root=direct?"web/direct":"web/dashboard";
const rust=fs.readFileSync("src-tauri/src/exp.rs","utf8");
const table=rust.match(/const EXP_200_TO_299:[\s\S]*?= \[([\s\S]*?)\];/)?.[1].split(",").map(v=>v.trim().replaceAll("_","")).filter(Boolean);
if(table?.length!==100) throw new Error("경험치표를 확인하세요.");
export default defineConfig(({mode,command})=>{
const productionDefaults=command==="build"?{
 PUBLIC_ORIGIN:process.env.PUBLIC_ORIGIN||"https://app.guildmate.workers.dev",
 WEB_DASHBOARD_ORIGIN:process.env.WEB_DASHBOARD_ORIGIN||process.env.PUBLIC_ORIGIN||"https://app.guildmate.workers.dev",
 WEB_DIRECT_ORIGIN:process.env.WEB_DIRECT_ORIGIN||"https://maple-exp-personal.pages.dev"
}:{};
const env={...loadEnv(mode,process.cwd(),""),...process.env,...productionDefaults};
const {dashboardOrigin,directOrigin}=webOrigins(env);
const unit=(name:string)=>{const value=String(env[name]||"").trim();if(value&&!/^DAN-[A-Za-z0-9_-]{3,96}$/.test(value))throw new Error(`${name} 광고 단위 ID를 확인하세요.`);return value;};
let affiliates=[];try{affiliates=env.WEB_AFFILIATE_CARDS_JSON?JSON.parse(String(env.WEB_AFFILIATE_CARDS_JSON)):[];}catch{throw new Error("WEB_AFFILIATE_CARDS_JSON 형식을 확인하세요.");}
const monetization=direct?{adfit:{desktopLeft:"",desktopRight:"",desktopBottom:"",mobileBottom:""},affiliates:[]}:{adfit:{desktopLeft:unit("WEB_ADFIT_DESKTOP_LEFT"),desktopRight:unit("WEB_ADFIT_DESKTOP_RIGHT"),desktopBottom:unit("WEB_ADFIT_DESKTOP_BOTTOM"),mobileBottom:unit("WEB_ADFIT_MOBILE_BOTTOM")},affiliates};
const localProxy={target:"http://127.0.0.1:3100",changeOrigin:true};
const proxyOrigin=process.env.WEB_PROXY_ORIGIN||dashboardOrigin;
const localOrigin={name:"local-api-origin",configureServer(server:any){server.middlewares.use((request:any,_response:any,next:any)=>{if(request.url?.startsWith("/api/")||request.url?.startsWith("/auth/"))request.headers.origin=proxyOrigin;next();});}};
return {
 root,plugins:[react(),tailwindcss(),...direct?[]:[localOrigin]],
 define:{"__EXP_TABLE__":JSON.stringify(table),"__DASHBOARD_ORIGIN__":JSON.stringify(dashboardOrigin),"__DIRECT_ORIGIN__":JSON.stringify(directOrigin),"__MONETIZATION__":JSON.stringify(monetization)},
 resolve:{alias:{"/src":path.resolve("src")}},
 build:{outDir:path.resolve("web-dist",direct?"direct":"dashboard"),emptyOutDir:true},
 server:{host:"127.0.0.1",port:direct?3101:3102,strictPort:true,fs:{allow:[process.cwd()]},proxy:direct?undefined:{"/api":localProxy,"/auth":localProxy},
 headers:direct?{"Content-Security-Policy":"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:3101 https://open.api.nexon.com; img-src 'self' https://open.api.nexon.com data:; frame-ancestors http://127.0.0.1:3102 https://app.guildmate.workers.dev; base-uri 'none'","Referrer-Policy":"no-referrer"}:{}},
 preview:{host:"127.0.0.1",port:direct?3101:3102,strictPort:true}
};});
