// 광고 설정의 비활성 기본값과 외부 링크 검증을 확인합니다.
import {describe,expect,it} from "vitest";
import {hasAdFit,normalizeMonetization,shouldLoadAdFit} from "./monetizationConfig";

describe("공개 웹 광고 설정",()=>{
 it("설정이 없으면 광고를 완전히 비활성화",()=>{const value=normalizeMonetization(undefined);expect(hasAdFit(value)).toBe(false);expect(value.affiliates).toEqual([]);});
 it("HTTPS 제휴 링크만 최대 세 개 유지",()=>{const cards=Array.from({length:5},(_,index)=>({provider:"coupang",title:`상품 ${index}`,description:"설명",url:index===0?"javascript:alert(1)":`https://example.com/${index}`}));const value=normalizeMonetization({affiliates:cards});expect(value.affiliates).toHaveLength(3);expect(value.affiliates.every(card=>card.url.startsWith("https://"))).toBe(true);});
 it("광고 단위 설정 여부를 판별",()=>{expect(hasAdFit(normalizeMonetization({adfit:{desktopLeft:"DAN-test"}}))).toBe(true);});
 it("명시적으로 허용한 경우에만 외부 광고 로드를 허용",()=>{const config=normalizeMonetization({adfit:{mobileBottom:"DAN-test"}});expect(shouldLoadAdFit(config,null)).toBe(false);expect(shouldLoadAdFit(config,"declined")).toBe(false);expect(shouldLoadAdFit(config,"accepted")).toBe(true);});
});
