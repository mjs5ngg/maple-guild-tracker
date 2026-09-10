// 대표 재조회 중복 제거와 다음 새로고침의 캐시 격리를 검증합니다.
import {expect,it,vi} from "vitest";
import {personalCharacter} from "./personalCharacter";
it("같은 실행의 대표는 한 번 조회하고 다음 실행은 새로 조회한다",async()=>{
 const request=vi.fn(async(path:string)=>path==="id"?{ocid:"id"}:{character_name:"대표"});
 const read=personalCharacter(request);
 const first=await read("대표");
 expect(await read("대표")).toBe(first);expect(request).toHaveBeenCalledTimes(2);
 await personalCharacter(request)("대표");expect(request).toHaveBeenCalledTimes(4);
});
it("실패한 조회를 성공 결과로 기억하지 않는다",async()=>{
 const request=vi.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce({ocid:"id"}).mockResolvedValueOnce({character_name:"대표"});
 const read=personalCharacter(request);
 await expect(read("대표")).rejects.toThrow("network");
 expect((await read("대표")).ocid).toBe("id");
});
