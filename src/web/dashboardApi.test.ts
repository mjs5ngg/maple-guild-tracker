// 공개 터널을 통과하는 대시보드 API 요청과 비정상 응답 처리를 검증합니다.
import {describe,expect,it,vi} from "vitest";
import {dashboardApi} from "./dashboardApi";

describe("dashboardApi",()=>{
 it("GET 요청에도 ngrok 안내 우회 헤더를 보낸다",async()=>{
  const fetcher=vi.fn(async()=>new Response('{"ok":true}',{headers:{"Content-Type":"application/json"}}));
  await expect(dashboardApi("/api/status",undefined,fetcher as typeof fetch)).resolves.toEqual({ok:true});
  expect(fetcher).toHaveBeenCalledWith("/api/status",expect.objectContaining({headers:{"ngrok-skip-browser-warning":"1"}}));
 });

 it("POST 요청에는 JSON과 안내 우회 헤더를 함께 보낸다",async()=>{
  const fetcher=vi.fn(async()=>new Response('{"ok":true}'));
  await dashboardApi("/api/activity",{},fetcher as typeof fetch);
  expect(fetcher).toHaveBeenCalledWith("/api/activity",expect.objectContaining({
   method:"POST",headers:{"ngrok-skip-browser-warning":"1","Content-Type":"application/json"},body:"{}"
  }));
 });

 it("HTML 응답은 이해 가능한 연결 오류로 분류한다",async()=>{
  const fetcher=vi.fn(async()=>new Response("<!DOCTYPE html><title>ngrok</title>"));
  await expect(dashboardApi("/api/status",undefined,fetcher as typeof fetch)).rejects.toThrow("서비스 연결 안내 페이지가 응답했습니다");
 });
});
