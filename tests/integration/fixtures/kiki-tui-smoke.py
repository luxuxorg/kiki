"""Exercise a real OpenCode 2 TUI in a fixture HOME; no third-party Python modules.

The fixture installs the packaged V2 plugin (server opencode.jsonc plus
cli.json TUI registration) and drives the native /kiki slash command with
value-returning dialogs. It prints only fixture terminal text; a real user
config or credential file is never loaded by this script.
"""
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

ENTER = "\r"
DOWN = "\x1b[B"


def expected_language(environ=os.environ):
    """Mirror the plugin's LC_ALL > LC_MESSAGES > LANG, first non-empty rule."""
    for name in ("LC_ALL", "LC_MESSAGES", "LANG"):
        value = environ.get(name, "").strip()
        if value:
            base = re.split(r"[.@]", value.lower(), maxsplit=1)[0]
            return "de" if base == "de" or base.startswith(("de_", "de-")) else "en"
    return "en"


TEXT = {
    "de": {
        "menu_global": "Modell ändern — global",
        "agents_global": "Kiki-Agent auswählen — global",
        "agents_project": "Kiki-Agent auswählen — dieses Projekt",
        "models_global": "Modell (global)",
        "models_project": "Modell (dieses Projekt)",
        "inherit": "Globales Modell",
        "delete_all": "Alle lokalen",
        "delete_all_title": "Alle lokalen Modell-Zuordnungen löschen?",
        "saved": "gespeichert",
        "reset": "zurückgesetzt",
    },
    "en": {
        "menu_global": "Change model — global",
        "agents_global": "Select Kiki agent — global",
        "agents_project": "Select Kiki agent — this project",
        "models_global": "Model (global)",
        "models_project": "Model (this project)",
        "inherit": "Use global model",
        "delete_all": "Delete all local",
        "delete_all_title": "Delete all local model assignments?",
        "saved": "saved",
        "reset": "reset",
    },
}[expected_language()]


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


def pump_for(seconds):
    until = time.monotonic() + seconds
    while time.monotonic() < until:
        pump()


def wait_for(texts, timeout=25):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if any(text in screen.text() for text in texts):
            return
        pump()
    raise RuntimeError("TUI did not show: " + " / ".join(texts))


def send(text):
    os.write(fd, text.encode("utf-8"))


def choose(text):
    send(text)
    pump_for(0.3)
    send(ENTER)
    pump_for(0.2)


def open_menu(project_scope=False):
    send("/kiki")
    pump_for(0.6)
    send(ENTER)
    wait_for([TEXT["menu_global"]])
    if project_scope:
        send(DOWN)
        pump_for(0.25)
    send(ENTER)


try:
    wait_for(["Fix a TODO", "What is the tech stack", "Fix broken tests"], 40)
    # Let the external cli.json TUI plugin finish activation before /kiki.
    pump_for(2.0)

    # Global save through the native slash command and value-returning dialogs.
    open_menu()
    wait_for([TEXT["agents_global"]])
    choose("kiki-reviewer")
    wait_for([TEXT["models_global"]])
    choose("Kiki Fixture Model")
    wait_for([TEXT["saved"]])
    print("PASS: /kiki global save")
    pump_for(0.4)

    # Project scope: remove only the local override through the inherit entry.
    open_menu(project_scope=True)
    wait_for([TEXT["agents_project"]])
    choose("kiki-reviewer")
    wait_for([TEXT["models_project"]])
    choose(TEXT["inherit"])
    wait_for([TEXT["reset"]])
    print("PASS: /kiki project override removal")
    pump_for(0.4)

    # Remove-all is guarded by the native confirmation dialog.
    open_menu(project_scope=True)
    wait_for([TEXT["agents_project"]])
    choose(TEXT["delete_all"])
    wait_for([TEXT["delete_all_title"]])
    send(ENTER)
    wait_for([TEXT["reset"]])
    print("PASS: /kiki remove-all confirmation")
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
