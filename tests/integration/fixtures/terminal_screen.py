"""Small VT screen reader for assertions against OpenTUI's incremental output."""
import re
import unicodedata


class Screen:
    csi = re.compile(r"\x1b\[([0-?]*)([ -/]*)([@-~])")
    osc = re.compile(r"\x1b\].*?(?:\x07|\x1b\\)", re.S)

    def __init__(self, rows=45, cols=160):
        self.rows, self.cols = rows, cols
        self.cells = [[" "] * cols for _ in range(rows)]
        self.row = self.col = 0
        self.saved = (0, 0)
        self.pending = ""

    def feed(self, text):
        self.pending += text
        index = 0
        while index < len(self.pending):
            ch = self.pending[index]
            if ch == "\x1b":
                rest = self.pending[index:]
                if len(rest) < 2:
                    break
                if rest[1] == "[":
                    match = self.csi.match(rest)
                    if not match:
                        break
                    self.control(match[1], match[3])
                    index += len(match[0])
                    continue
                if rest[1] == "]":
                    match = self.osc.match(rest)
                    if not match:
                        break
                    index += len(match[0])
                    continue
                if rest[1] in "()":
                    if len(rest) < 3:
                        break
                    index += 3
                    continue
                if rest[1] == "7":
                    self.saved = (self.row, self.col)
                elif rest[1] == "8":
                    self.row, self.col = self.saved
                index += 2
                continue
            if ch == "\r":
                self.col = 0
            elif ch == "\n":
                self.down()
            elif ch == "\b":
                self.col = max(0, self.col - 1)
            elif ch == "\t":
                self.col = min(self.cols - 1, (self.col // 8 + 1) * 8)
            elif ch >= " " and ch != "\x7f":
                if unicodedata.combining(ch):
                    self.cells[self.row][max(0, self.col - 1)] += ch
                else:
                    width = 2 if unicodedata.east_asian_width(ch) in ("W", "F") else 1
                    if self.col + width > self.cols:
                        self.col = 0
                        self.down()
                    self.cells[self.row][self.col] = ch
                    if width == 2:
                        self.cells[self.row][self.col + 1] = ""
                    self.col += width
            index += 1
        self.pending = self.pending[index:]

    def down(self):
        self.row += 1
        if self.row >= self.rows:
            self.cells.pop(0)
            self.cells.append([" "] * self.cols)
            self.row = self.rows - 1

    def control(self, params, final):
        if params.startswith(("?", ">", "<", "!")):
            return
        values = [int(value) if value.isdigit() else 0 for value in params.split(";")]
        count = values[0] or 1
        if final in ("H", "f"):
            self.row = max(0, min(self.rows - 1, count - 1))
            self.col = max(0, min(self.cols - 1, (values[1] if len(values) > 1 and values[1] else 1) - 1))
        elif final == "G":
            self.col = min(self.cols - 1, count - 1)
        elif final == "A":
            self.row = max(0, self.row - count)
        elif final == "B":
            self.row = min(self.rows - 1, self.row + count)
        elif final == "C":
            self.col = min(self.cols - 1, self.col + count)
        elif final == "D":
            self.col = max(0, self.col - count)
        elif final == "K":
            start, end = (0, self.cols) if values[0] == 2 else (0, self.col + 1) if values[0] == 1 else (min(self.col, self.cols), self.cols)
            self.cells[self.row][start:end] = [" "] * (end - start)
        elif final == "J":
            for row in range(self.rows):
                if values[0] in (2, 3) or (values[0] == 0 and row > self.row) or (values[0] == 1 and row < self.row):
                    self.cells[row] = [" "] * self.cols
                elif row == self.row:
                    self.control(str(1 if values[0] == 1 else 0), "K")
        elif final == "s":
            self.saved = (self.row, self.col)
        elif final == "u":
            self.row, self.col = self.saved

    def text(self):
        return "\n".join("".join(row).rstrip() for row in self.cells)
