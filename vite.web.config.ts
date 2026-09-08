// 웹 대시보드와 개인 키 화면을 서로 다른 빌드 및 출처로 분리합니다.
import {defineConfig,loadEnv} from "vite";
import {webOrigins} from "./scripts/web-origins";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
const direct=process.env.WEB_DIRECT==="1";
const root=direct?"web/direct":"web/dashboard";
const rust=fs.readFileSync("src-tauri/src/exp.rs","utf8");
const table=rust.match(/const EXP_200_TO_299:[\s\S]*?= \[([\s\S]*?)\];/)?.[1].split(",").map(v=>v.trim().replaceAll("_","")).filter(Boolean);
if(table?.length!==100) throw new Error("경험치표를 확인하세요.");
export default defineConfig(({mode})=>{
const {dashboardOrigin,directOrigin}=webOrigins({...loadEnv(mode,process.cwd(),""),...process.env});
return {
 root,plugins:[react()],
 define:{"__EXP_TABLE__":JSON.stringify(table),"__DASHBOARD_ORIGIN__":JSON.stringify(dashboardOrigin),"__DIRECT_ORIGIN__":JSON.stringify(directOrigin)},
 resolve:{alias:{"/src":path.resolve("src")}},
 build:{outDir:path.resolve("web-dist",direct?"direct":"dashboard"),emptyOutDir:true},
 server:{host:"127.0.0.1",port:direct?3101:3102,strictPort:true,fs:{allow:[process.cwd()]},
 headers:direct?{"Content-Security-Policy":"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:3101 https://open.api.nexon.com; img-src 'self' https://open.api.nexon.com data:; frame-ancestors 'none'; base-uri 'none'","Referrer-Policy":"no-referrer"}:{}},
 preview:{host:"127.0.0.1",port:direct?3101:3102,strictPort:true}
};});
