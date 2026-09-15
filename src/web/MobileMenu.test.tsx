// 모바일 드로어의 닫힘 상태와 탐색 항목 렌더링을 검증합니다.
import {describe,expect,it} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
import MobileMenu from "./MobileMenu";

const Icon=()=>null;
describe("모바일 우측 메뉴",()=>{
 it("닫혀 있으면 페이지를 덮지 않음",()=>{expect(renderToStaticMarkup(<MobileMenu open={false} active="overview" items={[]} onNavigate={()=>{}} onClose={()=>{}}>도구</MobileMenu>)).toBe("");});
 it("기존 화면과 설정 도구를 한 목록에 표시",()=>{const html=renderToStaticMarkup(<MobileMenu open active="favorites" items={[{key:"overview",label:"개요",Icon},{key:"favorites",label:"즐겨찾기",Icon}]} onNavigate={()=>{}} onClose={()=>{}}><button>설정</button></MobileMenu>);expect(html).toContain("개요");expect(html).toContain("즐겨찾기");expect(html).toContain("설정");expect(html).toContain("aria-modal=\"true\"");expect(html).toContain("class=\"active\"");});
});
