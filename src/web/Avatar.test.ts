// 공개 웹 캐릭터 이미지가 큰 원본과 왕복 프레임을 사용하는지 검증합니다.
import {describe,expect,it} from "vitest";
import {avatarUrl} from "./Avatar";

describe("공개 웹 캐릭터 이미지",()=>{
 it("큰 이미지 좌표와 지정 프레임을 요청",()=>{const url=new URL(avatarUrl("https://open.api.nexon.com/look?id=1","A02.1"));expect(url.searchParams.get("action")).toBe("A02.1");expect(url.searchParams.get("width")).toBe("240");expect(url.searchParams.get("x")).toBe("120");});
});
