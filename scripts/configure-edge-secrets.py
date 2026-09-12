# 로컬 Google 설정과 새 수집 서명을 출력하지 않고 Cloudflare와 Linux에 연결합니다.
import json
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import sys


ORIGIN = "https://maple-exp-public.mjs5ng.workers.dev"


def read_google(path: Path):
    values = {}
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        name, separator, value = line.partition("=")
        if separator and name in ("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"):
            values[name] = value.strip().strip('"')
    if not re.fullmatch(r"[A-Za-z0-9_-]+\.apps\.googleusercontent\.com", values.get("GOOGLE_CLIENT_ID", "")):
        raise ValueError("Google client id unavailable")
    if not re.fullmatch(r"GOCSPX-[A-Za-z0-9_-]+", values.get("GOOGLE_CLIENT_SECRET", "")):
        raise ValueError("Google client secret unavailable")
    return values


def put_secret(command: str, name: str, value: str):
    result = subprocess.run(
        [command, "wrangler", "secret", "put", name, "--config", "edge/wrangler.jsonc"],
        input=(value + "\n").encode(), stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    if result.returncode:
        raise RuntimeError(f"Cloudflare secret update failed: {name}")


def main():
    google = read_google(Path(".env"))
    ingest = secrets.token_urlsafe(48)
    npx = shutil.which("npx.cmd") or shutil.which("npx")
    if not npx:
        raise RuntimeError("npx unavailable")
    put_secret(npx, "INGEST_HMAC_SECRET", ingest)
    put_secret(npx, "GOOGLE_CLIENT_ID", google["GOOGLE_CLIENT_ID"])
    put_secret(npx, "GOOGLE_CLIENT_SECRET", google["GOOGLE_CLIENT_SECRET"])
    receiver = Path(__file__).with_name("update-edge-linux-config.py").resolve()
    linux_path = "/mnt/c/" + str(receiver)[3:].replace("\\", "/")
    result = subprocess.run(
        ["wsl", "-d", "Ubuntu-24.04", "-u", "root", "--", "python3", linux_path],
        input=json.dumps({"origin": ORIGIN, "secret": ingest}).encode(),
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    if result.returncode:
        raise RuntimeError("Linux edge configuration failed")
    print("Cloudflare와 Linux 수집 인증 연결 완료.")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        print("수집 인증 연결 실패. 비밀 값은 출력하지 않습니다.", file=sys.stderr)
        sys.exit(1)
