// 공식 API 캐릭터 이미지를 표시하고 실패하면 이름 첫 글자를 대신 보여줍니다.
import { useEffect, useState } from "react";

interface Props {
  image: string | null;
  name: string;
  mini?: boolean;
  active?: boolean;
}

export function avatarImageUrl(image: string, action = "A00"): string {
  const url = new URL(image);
  url.searchParams.set("action", action);
  url.searchParams.set("width", "128");
  url.searchParams.set("height", "128");
  url.searchParams.set("x", "64");
  url.searchParams.set("y", "90");
  return url.toString();
}

export function CharacterAvatar({ image, name, mini = false, active = false }: Props) {
  const [failed, setFailed] = useState(false);
  const [walkingFrame, setWalkingFrame] = useState(0);

  useEffect(() => setFailed(false), [image]);
  useEffect(() => {
    if (!active) {
      setWalkingFrame(0);
      return;
    }
    const timer = globalThis.setInterval(() => setWalkingFrame((value) => (value + 1) % 4), 180);
    return () => globalThis.clearInterval(timer);
  }, [active]);

  return (
    <span className={mini ? "mini-avatar" : "avatar"} title={active ? "사냥 중 · 최근 20분 내 경험치 증가" : undefined}>
      {image && !failed
        ? <img src={avatarImageUrl(image, active ? `A02.${walkingFrame}` : "A00.0")} alt={`${name} 캐릭터`} loading="lazy" onError={() => setFailed(true)} />
        : name.slice(0, 1)}
    </span>
  );
}
