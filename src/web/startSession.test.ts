// 비로그인 초기화 순서와 실패 시 설정 격리를 검증합니다.
import {expect,it,vi} from "vitest";
import {startSession} from "./startSession";
it.each([false,true])("세션을 준비하고 로그인 여부 %s와 설정을 보존한다",async signedIn=>{
 const profile={signedIn,primary:"대표",favorites:["친구"]};
 const api=vi.fn().mockResolvedValueOnce({ok:true}).mockResolvedValueOnce(profile);
 expect(await startSession(api)).toEqual(profile);
 expect(api.mock.calls).toEqual([["/api/device",{}],["/api/me"]]);
});
it("만료·연결 실패를 숨기거나 다른 설정으로 전환하지 않는다",async()=>{
 const api=vi.fn().mockRejectedValue(new Error("로그인 만료"));
 await expect(startSession(api)).rejects.toThrow("로그인 만료");
 expect(api).toHaveBeenCalledTimes(1);
});
