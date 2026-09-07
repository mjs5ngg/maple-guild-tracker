# Google 일회용 설정의 기존 값 보존과 외부 요청 차단을 검증합니다.
import importlib.util
from http.client import HTTPConnection
from http.server import HTTPServer
from pathlib import Path
import tempfile
import threading
import unittest
from urllib.parse import urlencode

spec = importlib.util.spec_from_file_location("connector", Path(__file__).with_name("connect-google-local.py"))
connector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(connector)


class ConnectorTests(unittest.TestCase):
    def test_preserves_other_configuration(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / ".env"
            path.write_text("DATABASE_URL=keep\nGOOGLE_CLIENT_ID=old\n# keep comment\n", encoding="utf-8")
            connector.save_credentials(path, "test.apps.googleusercontent.com", "GOCSPX-test")
            result = path.read_text()
            self.assertIn("DATABASE_URL=keep", result)
            self.assertIn("# keep comment", result)
            self.assertEqual(result.count("GOOGLE_CLIENT_ID="), 1)
            before = result
            with self.assertRaises(ValueError):
                connector.save_credentials(path, "test.apps.googleusercontent.com", "bad\nINJECT=1")
            self.assertEqual(path.read_text(), before)

    def test_one_shot_and_origin_rejection(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / ".env"
            server = HTTPServer(("127.0.0.1", 0), connector.handler_for(path, "test-token"))
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            origin = f"http://127.0.0.1:{server.server_port}"
            data = urlencode({"client_id": "test.apps.googleusercontent.com", "secret": "GOCSPX-test"})
            try:
                for route, source, expected in [("/wrong", origin, 403), ("/test-token", "https://evil.invalid", 403), ("/test-token", "null", 403), ("/test-token", origin, 200)]:
                    conn = HTTPConnection("127.0.0.1", server.server_port, timeout=5)
                    conn.request("POST", route, data, {"Origin": source})
                    response = conn.getresponse()
                    self.assertEqual(response.status, expected)
                    self.assertNotIn(b"GOCSPX-test", response.read())
                    conn.close()
                    if expected == 403:
                        self.assertFalse(path.exists())
                thread.join(2)
                self.assertFalse(thread.is_alive())
                self.assertTrue(path.exists())
            finally:
                server.shutdown()
                server.server_close()


if __name__ == "__main__":
    unittest.main()
