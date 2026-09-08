// 대시보드 통신 실패와 복구의 데이터 및 오류 상태를 검증합니다.
import {expect,it,vi} from "vitest";
import {loadDashboard} from "./loadDashboard";
it("실패 시 데이터를 보존하고 성공하면 조회 오류를 해제한다",async()=>{
 const apply=vi.fn(),error=vi.fn();
 await loadDashboard(()=>Promise.reject(new Error("offline")),apply,error);
 expect(apply).not.toHaveBeenCalled();
 expect(error).toHaveBeenLastCalledWith("Error: offline");
 await loadDashboard(()=>Promise.resolve({characters:[]}),apply,error);
 expect(apply).toHaveBeenCalledWith({characters:[]});
 expect(error).toHaveBeenLastCalledWith("");
});
