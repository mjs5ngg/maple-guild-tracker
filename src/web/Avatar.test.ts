// 공개 웹 캐릭터 이미지가 큰 원본과 왕복 프레임을 사용하는지 검증합니다.
import {describe,expect,it} from "vitest";
import {avatarUrl,IDLE_FRAMES,IDLE_INTERVAL_MS,WALK_FRAMES,WALK_INTERVAL_MS} from "./Avatar";

describe("공개 웹 캐릭터 이미지",()=>{
 it("큰 이미지 좌표와 지정 프레임을 요청",()=>{const url=new URL(avatarUrl("https://open.api.nexon.com/look?id=1","A02.1"));expect(url.searchParams.get("action")).toBe("A02.1");expect(url.searchParams.get("width")).toBe("240");expect(url.searchParams.get("x")).toBe("120");});
 it("PC와 같은 네 프레임과 180ms 주기를 사용",()=>{expect(WALK_FRAMES).toEqual(["A02.0","A02.1","A02.2","A02.3"]);expect(WALK_INTERVAL_MS).toBe(180);});
 it("대표 대기 모션은 1→2→3→2 순서로 느리게 순환",()=>{expect(IDLE_FRAMES).toEqual(["A00.1","A00.2","A00.3","A00.2"]);expect(IDLE_INTERVAL_MS).toBe(650);});
});
