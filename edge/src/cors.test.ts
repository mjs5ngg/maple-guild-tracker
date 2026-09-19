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
