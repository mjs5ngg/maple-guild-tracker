// Android 앱 내장 화면의 교차 출처 호출과 Bearer 세션 추출 규칙을 검증합니다.
import {expect,it} from "vitest";
import worker,{corsHeaders,sessionToken} from "./index";

const token="a".repeat(64);
const env={} as Parameters<typeof worker.fetch>[1];

it("앱 출처에만 CORS를 허용한다",()=>{
 expect(corsHeaders("http://tauri.localhost")["access-control-allow-origin"]).toBe("http://tauri.localhost");
 expect(corsHeaders("https://evil.example")).toEqual({});
 expect(corsHeaders(null)).toEqual({});
});

it("프리플라이트는 D1 없이 204로 응답한다",async()=>{
 const response=await worker.fetch(new Request("https://guildfollow.com/api/profile",{method:"OPTIONS",headers:{origin:"http://tauri.localhost"}}),env);
 expect(response.status).toBe(204);
 expect(response.headers.get("access-control-allow-headers")).toContain("authorization");
 expect(response.headers.get("access-control-max-age")).toBe("7200");
});

it("허용하지 않은 출처의 쓰기 요청은 거절하고 CORS 헤더를 붙이지 않는다",async()=>{
 const response=await worker.fetch(new Request("https://guildfollow.com/api/profile",{method:"POST",headers:{origin:"https://evil.example"},body:"{}"}),env);
 expect(response.status).toBe(403);
 expect(response.headers.get("access-control-allow-origin")).toBeNull();
});

it("Bearer 토큰을 쿠키보다 먼저 읽고 형식이 틀리면 무시한다",()=>{
 expect(sessionToken(new Request("https://x/",{headers:{authorization:`Bearer ${token}`,cookie:"maple_session=cookie"}}))).toBe(token);
 expect(sessionToken(new Request("https://x/",{headers:{cookie:"maple_session=cookie"}}))).toBe("cookie");
 expect(sessionToken(new Request("https://x/",{headers:{authorization:"Bearer bad token"}}))).toBe("");
});

it("POST+덮어쓰기 헤더는 프리셋 이름 변경(PATCH)으로 처리한다",async()=>{
 const sql:string[]=[];
 const statement=(text:string)=>{const self={bind:()=>self,first:async()=>{sql.push(text);return text.includes("FROM sessions")?{user_id:"u"}:text.startsWith("UPDATE chase_presets")?{id:"p",name:"새이름",ocidsJson:"[]"}:null;}};return self;};
 const fake={DB:{prepare:statement}} as unknown as Parameters<typeof worker.fetch>[1];
 const response=await worker.fetch(new Request("https://guildfollow.com/api/chase-presets/p",{method:"POST",headers:{origin:"https://guildfollow.com",authorization:`Bearer ${token}`,"x-http-method-override":"PATCH","content-type":"application/json"},body:JSON.stringify({name:"새이름"})}),fake);
 expect(response.status).toBe(200);
 expect(sql.some(text=>text.startsWith("UPDATE chase_presets SET name"))).toBe(true);
});
