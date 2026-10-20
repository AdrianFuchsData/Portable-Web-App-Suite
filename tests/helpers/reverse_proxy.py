"""A small TLS-terminating reverse proxy for tests, behaving like nginx/Apache/HAProxy in front of the relay: it adds
X-Forwarded-For/-Proto/-Host and passes WebSocket upgrades through (raw piping after the request head)."""
import asyncio
import ssl
import threading


class ReverseProxy:
    def __init__(self, upstream_port, cert, key, client_addr="198.51.100.20"):
        self.upstream_port = upstream_port
        self.client_addr = client_addr  # pretend that the browser is on another machine
        self.ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        self.ctx.load_cert_chain(str(cert), str(key))
        self.loop = asyncio.new_event_loop()
        self.ready = threading.Event()
        self.port = None
        threading.Thread(target=self._run, daemon=True).start()
        self.ready.wait(10)

    def _run(self):
        asyncio.set_event_loop(self.loop)
        server = self.loop.run_until_complete(asyncio.start_server(self._handle, "127.0.0.1", 0, ssl=self.ctx))
        self.port = server.sockets[0].getsockname()[1]
        self.ready.set()
        self.loop.run_forever()

    async def _handle(self, reader, writer):
        try:
            head = await reader.readuntil(b"\r\n\r\n")
            lines = head.decode("latin-1").split("\r\n")
            host = next((l.split(":", 1)[1].strip() for l in lines[1:] if l.lower().startswith("host:")), "")
            kept = [l for l in lines[1:] if l and not l.lower().startswith(("x-forwarded-", "host:"))]
            out = [lines[0], f"Host: 127.0.0.1:{self.upstream_port}", *kept,
                   f"X-Forwarded-For: {self.client_addr}", "X-Forwarded-Proto: https", f"X-Forwarded-Host: {host}", "", ""]
            up_reader, up_writer = await asyncio.open_connection("127.0.0.1", self.upstream_port)
            up_writer.write("\r\n".join(out).encode("latin-1"))

            async def pipe(src, dst):
                try:
                    while True:
                        data = await src.read(65536)
                        if not data:
                            break
                        dst.write(data)
                        await dst.drain()
                except ConnectionError:
                    pass
                finally:
                    try:
                        dst.close()
                    except Exception:
                        pass
            await asyncio.gather(pipe(reader, up_writer), pipe(up_reader, writer))
        except (asyncio.IncompleteReadError, ConnectionError, ssl.SSLError):
            writer.close()

    def stop(self):
        self.loop.call_soon_threadsafe(self.loop.stop)
