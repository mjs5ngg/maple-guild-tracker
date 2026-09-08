# 승인된 운영 키와 Google 설정을 출력 없이 WSL root 전용 파일로 이전합니다.
import ctypes
from ctypes import wintypes
import json
from pathlib import Path
import re
import subprocess
import sys


def main():
    database = sys.argv[1]
    if not re.fullmatch(r"maple_live_[0-9_]+", database):
        raise ValueError("invalid target database")
    class Credential(ctypes.Structure):
        _fields_ = [("flags", wintypes.DWORD), ("type", wintypes.DWORD),
                    ("target", wintypes.LPWSTR), ("comment", wintypes.LPWSTR),
                    ("written", wintypes.FILETIME), ("size", wintypes.DWORD),
                    ("blob", ctypes.POINTER(ctypes.c_ubyte)), ("persist", wintypes.DWORD),
                    ("count", wintypes.DWORD), ("attributes", ctypes.c_void_p),
                    ("alias", wintypes.LPWSTR), ("user", wintypes.LPWSTR)]
    library = ctypes.WinDLL("Advapi32.dll", use_last_error=True)
    pointer = ctypes.POINTER(Credential)()
    library.CredReadW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD,
                                 ctypes.POINTER(ctypes.POINTER(Credential))]
    library.CredFree.argtypes = [ctypes.c_void_p]
    if not library.CredReadW("nexon-open-api-key.maple-guild-tracker", 1, 0, ctypes.byref(pointer)):
        raise RuntimeError("credential unavailable")
    try:
        key = ctypes.string_at(pointer.contents.blob, pointer.contents.size).decode("utf-16-le")
    finally:
        library.CredFree(pointer)
    source = {}
    for line in Path(".env").read_text(encoding="utf-8-sig").splitlines():
        name, separator, value = line.partition("=")
        if separator and name in ("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"):
            source[name] = value.strip().strip('"')
    if len(source) != 2 or not key:
        raise RuntimeError("required settings missing")
    source.update(NEXON_OPERATOR_KEY=key, PUBLIC_ORIGIN="http://127.0.0.1:3100",
                  DATABASE_URL=f"postgresql:///{database}?host=/var/run/postgresql&port=5433&user=mapledev")
    for value in source.values():
        if not re.fullmatch(r"[A-Za-z0-9_.:/?=&%+@-]+", value):
            raise ValueError("unexpected setting format")
    receiver = Path(__file__).with_name("receive-linux-secrets.py").resolve()
    linux_path = "/mnt/c/" + str(receiver)[3:].replace("\\", "/")
    result = subprocess.run(["wsl", "-d", "Ubuntu-24.04", "-u", "root", "--",
                             "python3", linux_path], input=json.dumps(source).encode(),
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        raise RuntimeError("protected configuration transfer failed; existing files preserved")
    print("운영 설정 비공개 이전 완료.")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        print("운영 설정 이전 실패. 비밀 값은 출력하지 않습니다.", file=sys.stderr)
        sys.exit(1)
