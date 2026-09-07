# 승인된 Google 키를 루프백 일회용 폼으로 받아 서버 설정에 보관합니다.
import os
from pathlib import Path
import re
import secrets
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs


def save_credentials(path, client_id, secret):
    if not re.fullmatch(r"[A-Za-z0-9_-]+\.apps\.googleusercontent\.com", client_id):
        raise ValueError("invalid credentials")
    if not re.fullmatch(r"GOCSPX-[A-Za-z0-9_-]+", secret):
        raise ValueError("invalid credentials")
    original = path.read_text(encoding="utf-8-sig") if path.exists() else ""
    retained = [line for line in original.splitlines()
                if not re.match(r"\s*(?:export\s+)?GOOGLE_CLIENT_(?:ID|SECRET)\s*=", line)]
    result = "\n".join(retained + [f"GOOGLE_CLIENT_ID={client_id}",
                                  f"GOOGLE_CLIENT_SECRET={secret}", ""])
    fd, temporary = tempfile.mkstemp(prefix=".google-", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as output:
            output.write(result)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def handler_for(path, token):
    class Handler(BaseHTTPRequestHandler):
        def setup(self):
            self.request.settimeout(5)
            super().setup()

        def log_message(self, *_):
            pass

        def reply(self, status, body):
            self.send_response(status)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Referrer-Policy", "same-origin")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Security-Policy", "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'")
            self.end_headers()
            self.wfile.write(body.encode("utf-8"))

        def allowed(self):
            return (self.path == "/" + token and
                    self.headers.get("Host") == f"127.0.0.1:{self.server.server_port}")

        def do_GET(self):
            if not self.allowed():
                return self.reply(404, "Not found")
            self.reply(200, '<meta charset="utf-8"><h1>Google 로컬 서버 연결</h1>'
                       '<p>이 PC 전용 일회용 설정입니다. Google 키만 저장하며 5분 뒤 닫힙니다.</p>'
                       '<form method="post" autocomplete="off">'
                       '<label>클라이언트 ID<input name="client_id" autocomplete="off" required></label>'
                       '<label>비밀 키<input name="secret" type="password" autocomplete="off" required></label>'
                       '<button>서버에 저장</button></form>')

        def do_POST(self):
            origin = f"http://127.0.0.1:{self.server.server_port}"
            if not self.allowed() or self.headers.get("Origin") != origin:
                return self.reply(403, "Forbidden")
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= 4096:
                    raise ValueError()
                fields = parse_qs(self.rfile.read(length).decode("utf-8"), strict_parsing=True)
                if set(fields) != {"client_id", "secret"} or any(len(v) != 1 for v in fields.values()):
                    raise ValueError()
                save_credentials(path, fields["client_id"][0], fields["secret"][0])
            except (ValueError, OSError):
                return self.reply(400, "입력 또는 저장 상태를 확인하세요.")
            self.reply(200, "Google 설정 저장 완료. 이 입력 서버는 종료됩니다.")
            threading.Thread(target=self.server.shutdown, daemon=True).start()
    return Handler


if __name__ == "__main__":
    config = Path(__file__).resolve().parent.parent / ".env"
    nonce = secrets.token_urlsafe(32)
    server = HTTPServer(("127.0.0.1", 0), handler_for(config, nonce))
    timer = threading.Timer(300, server.shutdown)
    timer.daemon = True
    timer.start()
    print(f"http://127.0.0.1:{server.server_port}/{nonce}", flush=True)
    try:
        server.serve_forever()
    finally:
        timer.cancel()
        server.server_close()
