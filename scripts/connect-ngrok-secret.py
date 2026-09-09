# 일회용 루프백 폼으로 승인된 ngrok 토큰을 root 전용 환경 파일에 저장합니다.
import http.server
import os
import re
import secrets
import time
import urllib.parse

def run():
    nonce = secrets.token_urlsafe(32)
    saved = False
    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass
        def reply(self, code, body):
            self.send_response(code)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Security-Policy', "default-src 'none'; form-action 'self'; frame-ancestors 'none'")
            self.end_headers()
            self.wfile.write(body.encode())
        def do_GET(self):
            if self.path != '/' + nonce:
                return self.reply(404, 'Not found')
            self.reply(200, '<meta charset="utf-8"><title>ngrok 서버 연결</title><h1>ngrok 인증 저장</h1><form method="post"><label>인증 토큰<input name="token" type="password" autocomplete="off"></label><button>Linux에 저장</button></form>')
        def do_POST(self):
            nonlocal saved
            if saved or self.path != '/' + nonce or self.headers.get('Origin') != origin or self.headers.get('Host') != origin.removeprefix('http://'):
                return self.reply(403, 'Denied')
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length < 4096:
                    raise ValueError()
                token = urllib.parse.parse_qs(self.rfile.read(length).decode()).get('token', [''])[0]
                if not re.fullmatch(r'[A-Za-z0-9_-]{20,256}', token):
                    raise ValueError()
                os.makedirs('/etc/maple-exp', mode=0o700, exist_ok=True)
                fd = os.open('/etc/maple-exp/ngrok.env', os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                with os.fdopen(fd, 'w') as output:
                    output.write('NGROK_AUTHTOKEN=' + token + '\nNGROK_URL=https://antirust-chair-grove.ngrok-free.dev\n')
                saved = True
                self.reply(200, '저장 완료. 이 입력 창은 닫아도 됩니다.')
            except (ValueError, OSError):
                self.reply(400, '저장 실패. 입력 또는 기존 설정을 확인하세요.')
    server = http.server.HTTPServer(('127.0.0.1', 0), Handler)
    origin = 'http://127.0.0.1:' + str(server.server_port)
    server.timeout = 1
    print(origin + '/' + nonce, flush=True)
    deadline = time.monotonic() + 300
    while not saved and time.monotonic() < deadline:
        server.handle_request()
    server.server_close()
    print('saved' if saved else 'expired', flush=True)

if __name__ == '__main__':
    run()
