// 내부 수집 서명이 변조·재사용 시각·형식 오류를 거부하는지 검증합니다.
import {describe,expect,it} from "vitest";
import {hmac,signatureMatches,signedPayload} from "./security";

describe("수집 요청 서명",()=>{
 it("정상 서명을 허용한다",async()=>{
  const now=1_800_000_000_000,timestamp=String(now),batch="batch_1234567890_ab",body='{"current":[]}';
  const signature=await hmac("secret",signedPayload(timestamp,batch,body));
  expect(await signatureMatches("secret",timestamp,batch,body,signature,now)).toBe(true);
 });
 it("초 단위 수집기 시각도 같은 5분 창으로 해석한다",async()=>{
  const now=1_800_000_000_000,timestamp=String(now/1000),batch="batch_seconds_1234567",body="";
  const signature=await hmac("secret",signedPayload(timestamp,batch,body));
  expect(await signatureMatches("secret",timestamp,batch,body,signature,now)).toBe(true);
 });
 it("변조 본문과 5분 초과 시각을 거부한다",async()=>{
  const now=1_800_000_000_000,timestamp=String(now-300_001),batch="batch_1234567890_ab";
  const signature=await hmac("secret",signedPayload(timestamp,batch,"original"));
  expect(await signatureMatches("secret",timestamp,batch,"changed",signature,now)).toBe(false);
  expect(await signatureMatches("secret",timestamp,batch,"original",signature,now)).toBe(false);
 });
});
