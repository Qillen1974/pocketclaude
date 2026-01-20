import AnsiToHtml from 'ansi-to-html';

const converter = new AnsiToHtml({
  fg: '#d4d4d4',
  bg: '#1e1e1e',
  newline: true,
  escapeXML: true,
  colors: {
    0: '#000000',   // black
    1: '#f44747',   // red
    2: '#4ec9b0',   // green
    3: '#dcdcaa',   // yellow
    4: '#569cd6',   // blue
    5: '#c586c0',   // magenta
    6: '#9cdcfe',   // cyan
    7: '#d4d4d4',   // white
    8: '#808080',   // bright black
    9: '#f44747',   // bright red
    10: '#4ec9b0',  // bright green
    11: '#dcdcaa',  // bright yellow
    12: '#569cd6',  // bright blue
    13: '#c586c0',  // bright magenta
    14: '#9cdcfe',  // bright cyan
    15: '#ffffff',  // bright white
  },
});

// Strip terminal control sequences that ansi-to-html doesn't handle
function preprocessTerminal(text: string): string {
  return text
    // Strip OSC sequences (window title, etc): ESC ] ... (BEL or ESC \)
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    // Strip DEC Private Mode sequences: ESC [ ? Pm h/l
    .replace(/\x1b\[\?[0-9;]*[hl]/g, '')
    // Strip cursor position/movement: ESC [ Pn ; Pn H/f and ESC [ Pn A/B/C/D/G/X
    .replace(/\x1b\[[0-9;]*[HfABCDGJKX]/g, '')
    // Strip other CSI sequences we don't render: ESC [ ... (various)
    .replace(/\x1b\[[0-9;]*[su<>]/g, '')
    // Strip incomplete/malformed sequences that lost the ESC character
    .replace(/\?\d+[hl]/g, '')
    .replace(/\[\d*[ABCDGHX]/g, '');
}

export function ansiToHtml(text: string): string {
  const processed = preprocessTerminal(text);
  return converter.toHtml(processed);
}

export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
}
