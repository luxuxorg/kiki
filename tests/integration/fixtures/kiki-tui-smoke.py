"""Exercise a real OpenCode TUI in a fixture HOME; no third-party Python modules."""
import errno
import codecs
import fcntl
import os
import pty
import re
import select
import signal
import struct
import sys
import termios
import time
from terminal_screen import Screen

binary, project = sys.argv[1:]
pid, fd = pty.fork()
if pid == 0:
    os.chdir(project)
    os.execv(binary, [binary, project])

fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", 45, 160, 0, 0))
capture = ""
screen = Screen()
decoder = codecs.getincrementaldecoder("utf-8")(errors="replace")
ansi = re.compile(r"\x1b\][^\x07]*(?:\x07|\x1b\\)|\x1b\[[0-?]*[ -/]*[@-~]|\x1b[()][A-Z0-9]|\x1b[=>]")


def pump(timeout=0.2):
    global capture
    if not select.select([fd], [], [], timeout)[0]:
        return
    try:
        chunk = os.read(fd, 65536)
    except OSError as error:
        if error.errno == errno.EIO:
            raise RuntimeError("OpenCode exited before the menu completed") from error
        raise
    if not chunk:
        raise RuntimeError("OpenCode closed the terminal")
    # Answer the terminal queries required by the real renderer.
    if b"\x1b[6n" in chunk:
        os.write(fd, b"\x1b[1;1R")
    if b"\x1b[?u" in chunk:
        os.write(fd, b"\x1b[?0u")
    if b"\x1b[c" in chunk:
        os.write(fd, b"\x1b[?1;2c")
    decoded = decoder.decode(chunk)
    capture += decoded
    screen.feed(decoded)


def wait_for(texts, timeout=25):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if any(text in screen.text() for text in texts):
            return
        pump()
    raise RuntimeError("TUI did not show: " + " / ".join(texts))


def send(text):
    os.write(fd, text.encode("utf-8"))


try:
    wait_for(["Fix a TODO", "What is the tech stack", "Fix broken tests"], 40)
    # Let the external TUI plugin finish activation before invoking the slash command.
    until = time.monotonic() + 1.5
    while time.monotonic() < until:
        pump()
    send("/kiki")
    until = time.monotonic() + 0.5
    while time.monotonic() < until:
        pump()
    send("\r")
    wait_for(["Modell ändern — global"])
    send("\r")  # The default action must be global.
    wait_for(["Kiki-Agent auswählen — global"])
    send("kiki-reviewer")
    until = time.monotonic() + 0.2
    while time.monotonic() < until:
        pump()
    send("\r")
    wait_for(["Modell (global)"])
    send("Kiki Fixture Model")
    until = time.monotonic() + 0.2
    while time.monotonic() < until:
        pump()
    send("\r")
    wait_for(["gespeichert"])
    print("PASS: /kiki -> global -> kiki-reviewer -> Kiki Fixture Model -> saved")
except Exception as error:
    # Only fixture terminal output: no user's config or real credentials are loaded.
    print(str(error), file=sys.stderr)
    print(screen.text(), file=sys.stderr)
    print(ansi.sub("", capture)[-8000:], file=sys.stderr)
    sys.exit(1)
finally:
    try:
        os.kill(pid, signal.SIGTERM)
        until = time.monotonic() + 3
        while time.monotonic() < until:
            if os.waitpid(pid, os.WNOHANG)[0]:
                break
            time.sleep(0.05)
        else:
            os.kill(pid, signal.SIGKILL)
            os.waitpid(pid, 0)
    except (ProcessLookupError, ChildProcessError):
        pass
    os.close(fd)
