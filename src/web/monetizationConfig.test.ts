// 광고 설정의 비활성 기본값과 외부 링크 검증을 확인합니다.
import {describe,expect,it} from "vitest";
import {hasDisplayAds,normalizeMonetization} from "./monetizationConfig";

describe("공개 웹 광고 설정",()=>{
 it("설정이 없으면 광고를 완전히 비활성화",()=>{const value=normalizeMonetization(undefined);expect(hasDisplayAds(value)).toBe(false);expect(value.affiliates).toEqual([]);});
 it("HTTPS 제휴 링크만 최대 세 개 유지",()=>{const cards=Array.from({length:5},(_,index)=>({provider:"coupang",title:`상품 ${index}`,description:"설명",url:index===0?"javascript:alert(1)":`https://example.com/${index}`}));const value=normalizeMonetization({affiliates:cards});expect(value.affiliates).toHaveLength(3);expect(value.affiliates.every(card=>card.url.startsWith("https://"))).toBe(true);});
 it("광고 호스트와 단위가 모두 있어야 활성화",()=>{expect(hasDisplayAds(normalizeMonetization({ads:{desktopLeft:true}}))).toBe(false);expect(hasDisplayAds(normalizeMonetization({ads:{desktopLeft:true},adHostOrigin:"https://ads.example.com"}))).toBe(true);});
 it("유효한 광고 호스트와 단위가 있으면 별도 동의 상태 없이 활성화",()=>{const config=normalizeMonetization({ads:{mobileBottom:true},adHostOrigin:"https://ads.example.com"});expect(hasDisplayAds(config)).toBe(true);});
});
