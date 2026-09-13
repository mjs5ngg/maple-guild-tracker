// Document Picture-in-Picture 지원 판정을 검증합니다.
import {describe,expect,it} from "vitest";
import {supportsDocumentPip} from "./WebMiniWidget";

describe("웹 미니 위젯",()=>{
 it("요청 함수가 있을 때만 Document PiP를 지원한다",()=>{
  expect(supportsDocumentPip({documentPictureInPicture:{requestWindow:async()=>({} as Window),window:null}} as unknown as Window)).toBe(true);
  expect(supportsDocumentPip({} as Window)).toBe(false);
 });
});
