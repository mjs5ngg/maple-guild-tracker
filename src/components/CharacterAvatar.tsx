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
  url.searchParams.set("width", "200");
  url.searchParams.set("height", "200");
  url.searchParams.set("x", "100");
  url.searchParams.set("y", "100");
  return url.toString();
}

export function CharacterAvatar({ image, name, mini = false, active = false }: Props) {
  const [failed, setFailed] = useState(false);
  const [walkingFrame, setWalkingFrame] = useState(false);

  useEffect(() => setFailed(false), [image]);
  useEffect(() => {
    if (!active) return;
    const timer = globalThis.setInterval(() => setWalkingFrame((value) => !value), 360);
    return () => globalThis.clearInterval(timer);
  }, [active]);

  return (
    <span className={mini ? "mini-avatar" : "avatar"}>
      {image && !failed
        ? <img className={active ? "walking" : ""} src={avatarImageUrl(image, active ? (walkingFrame ? "A03" : "A02") : "A00")} alt={`${name} 캐릭터`} loading="lazy" onError={() => setFailed(true)} />
        : name.slice(0, 1)}
    </span>
  );
}
