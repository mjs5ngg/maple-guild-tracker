// 종료된 중앙 수집 Worker가 항상 쓰기 불가 응답을 반환하는지 검증합니다.
import {expect,it} from "vitest";
import worker from "./legacy-disabled";

it("레거시 중앙 수집 요청을 항상 거부한다",async()=>{
 const response=await worker.fetch();
 expect(response.status).toBe(410);
 await expect(response.json()).resolves.toEqual({error:"중앙 수집 서비스가 종료되었습니다."});
});
