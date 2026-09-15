// 광고 동의와 공개 대시보드의 AdFit·제휴 광고 표시를 관리합니다.
import {useEffect,useState} from "react";
import type {AdFitPlacement,AffiliateCard,MonetizationConfig} from "./monetizationConfig";
import {hasAdFit} from "./monetizationConfig";

export type AdConsent="accepted"|"declined"|null;
const CONSENT_KEY="ad-consent-v1";
const readConsent=():AdConsent=>{const value=localStorage.getItem(CONSENT_KEY);return value==="accepted"||value==="declined"?value:null;};
export function useAdConsent(){const [consent,setConsentState]=useState<AdConsent>(readConsent);const setConsent=(value:Exclude<AdConsent,null>)=>{localStorage.setItem(CONSENT_KEY,value);setConsentState(value);};const resetConsent=()=>{localStorage.removeItem(CONSENT_KEY);setConsentState(null);};return {consent,setConsent,resetConsent};}

const dimensions:Record<AdFitPlacement,[number,number]>={desktopLeft:[160,600],desktopRight:[160,600],desktopBottom:[728,90],mobileBottom:[320,100]};
export function AdFitSlot({placement,unit}:{placement:AdFitPlacement;unit:string}){const [width,height]=dimensions[placement];if(!unit)return null;return <div className={`adfit-slot ${placement}`} aria-label="광고"><span className="ad-disclosure">광고</span><ins className="kakao_ad_area" style={{display:"none",width:"100%"}} data-ad-unit={unit} data-ad-width={width} data-ad-height={height}/></div>;}

export function AdFitLoader({enabled,onFailure}:{enabled:boolean;onFailure:()=>void}){
 useEffect(()=>{if(!enabled||document.querySelector("script[data-guildmate-adfit]"))return;let failureTimer=0;const loadTimer=window.setTimeout(()=>{const script=document.createElement("script");script.async=true;script.src="https://t1.kakaocdn.net/kas/static/ba.min.js";script.dataset.guildmateAdfit="true";script.onerror=onFailure;failureTimer=window.setTimeout(()=>{if(!script.dataset.loaded)onFailure();},8000);script.onload=()=>{script.dataset.loaded="true";window.clearTimeout(failureTimer);};document.head.append(script);},750);return()=>{window.clearTimeout(loadTimer);window.clearTimeout(failureTimer);};},[enabled,onFailure]);
 return null;
}

export function AdConsentBanner({visible,onChoice}:{visible:boolean;onChoice:(value:"accepted"|"declined")=>void}){if(!visible)return null;return <section className="ad-consent" role="dialog" aria-labelledby="ad-consent-title" aria-describedby="ad-consent-copy"><div><b id="ad-consent-title">광고 쿠키를 선택해 주세요.</b><p id="ad-consent-copy">광고를 허용하면 카카오 AdFit이 광고 제공과 성과 측정을 위해 쿠키를 사용할 수 있습니다. 거부해도 모든 기능을 사용할 수 있습니다.</p><a href="/privacy">자세히 보기</a></div><div><button className="quiet-button" onClick={()=>onChoice("declined")}>필수 기능만</button><button className="primary-button" onClick={()=>onChoice("accepted")}>광고 허용</button></div></section>;}

export function AdSettingsButton({config,onReset}:{config:MonetizationConfig;onReset:()=>void}){if(!hasAdFit(config))return null;return <button type="button" className="footer-button" onClick={onReset}>광고 설정</button>;}

export function AffiliateRecommendations({cards}:{cards:AffiliateCard[]}){if(!cards.length)return null;return <section className="surface affiliate-section" aria-labelledby="affiliate-title"><div className="affiliate-heading"><div><span className="section-kicker">RECOMMENDED</span><h2 id="affiliate-title">추천 장비</h2></div><span>광고·제휴 링크</span></div><p className="affiliate-disclosure">링크를 통한 구매가 이루어지면 서비스 운영자가 수수료를 받을 수 있습니다.</p><div className="affiliate-grid">{cards.map(card=><a key={`${card.provider}:${card.url}`} href={card.url} target="_blank" rel="sponsored noopener noreferrer"><small>{card.provider==="coupang"?"쿠팡 파트너스":"링크프라이스"}</small><b>{card.title}</b><span>{card.description}</span><em>상품 보기 ↗</em></a>)}</div></section>;}
