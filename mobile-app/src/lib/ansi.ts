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

// Deduplicate repeated patterns within a line (e.g., "text text text" -> "text")
function deduplicateRepeatedPatterns(text: string): string {
  const lines = text.split('\n');
  const processedLines = lines.map(line => {
    // Look for patterns that repeat 3+ times consecutively
    // Use multiple pattern lengths to catch different repetitions
    let result = line;
    // Try patterns from 5 to 100 characters
    for (const len of [100, 80, 60, 50, 40, 30, 20, 15, 10, 5]) {
      const pattern = new RegExp(`(.{${len},${len + 20}}?)\\1{2,}`, 'g');
      result = result.replace(pattern, '$1');
    }
    return result;
  });
  return processedLines.join('\n');
}

// Process carriage returns properly - \r means "return to start of line"
// so text after \r should replace text before it (used for spinners, progress bars)
export function processCarriageReturns(text: string): string {
  // Split into lines (preserving \n)
  const lines = text.split('\n');
  const processedLines = lines.map(line => {
    // If line contains \r (but not at the very end), process overwrites
    if (line.includes('\r')) {
      // Split by \r and take the last non-empty segment
      // This simulates cursor returning to start of line and overwriting
      const segments = line.split('\r');
      // Find the last segment that has content
      for (let i = segments.length - 1; i >= 0; i--) {
        if (segments[i].length > 0) {
          return segments[i];
        }
      }
      return '';
    }
    return line;
  });
  return processedLines.join('\n');
}

// Strip terminal control sequences that ansi-to-html doesn't handle
function preprocessTerminal(text: string): string {
  // First, handle carriage returns to prevent spinner/progress duplication
  const crProcessed = processCarriageReturns(text);
  // Then deduplicate repeated patterns within lines
  const deduped = deduplicateRepeatedPatterns(crProcessed);
  return deduped
    // Strip OSC sequences (window title, etc): ESC ] ... (BEL or ESC \)
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    // Strip DEC Private Mode sequences: ESC [ ? Pm h/l
    .replace(/\x1b\[\?[0-9;]*[hl]/g, '')
    // Strip cursor position/movement: ESC [ Pn ; Pn H/f and ESC [ Pn A/B/C/D/G/X
    .replace(/\x1b\[[0-9;]*[HfABCDGJKX]/g, '')
    // Strip other CSI sequences we don't render: ESC [ ... (various)
    .replace(/\x1b\[[0-9;]*[su<>]/g, '')
    // Strip scroll region and other bracketed sequences
    .replace(/\x1b\[[0-9;]*[rLMPST@]/g, '')
    // Strip character set selection: ESC ( B, ESC ) 0, etc.
    .replace(/\x1b[()\*+][0-9A-Za-z]/g, '')
    // Strip application/normal keypad mode: ESC = and ESC >
    .replace(/\x1b[=>]/g, '')
    // Strip save/restore cursor: ESC 7 and ESC 8
    .replace(/\x1b[78]/g, '')
    // Strip status line sequences
    .replace(/\x1b\[[0-9;]*q/gi, '')
    // Strip bracketed paste mode markers
    .replace(/\x1b\[\?200[04][hl]/g, '')
    // Strip incomplete/malformed sequences that lost the ESC character
    .replace(/\?\d+[hl]/g, '')
    .replace(/\[\d*[ABCDGHX]/g, '')
    // Strip OSC remnants where ESC] was stripped but content remains (0;Title pattern)
    // Match 0; followed by any non-digit, non-semicolon character (valid OSC would be 0;digits;)
    .replace(/0;[^\d;\n][^\n]*/g, '')
    // Strip bell character
    .replace(/\x07/g, '')
    // Strip any remaining carriage returns (already processed above)
    .replace(/\r/g, '')
    // Strip repeated "↵ send" UI artifacts
    .replace(/(↵ send)+/g, '')
    // Strip any remaining non-printable control chars except newline/tab
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1A\x1C-\x1F]/g, '');
}

export function ansiToHtml(text: string): string {
  const processed = preprocessTerminal(text);
  return converter.toHtml(processed);
}

export function stripAnsi(text: string): string {
  // First process carriage returns to handle spinner/progress overwrites
  const crProcessed = processCarriageReturns(text);
  // Then strip ANSI escape sequences
  // eslint-disable-next-line no-control-regex
  return crProcessed.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '').replace(/\r/g, '');
}

// Tool names that Claude Code uses
const TOOL_PATTERNS = [
  /^(Read|Edit|Write|Bash|Grep|Glob|Task|WebFetch|WebSearch|TodoWrite|NotebookEdit)/i,
  /^(Reading|Editing|Writing|Running|Searching|Fetching|Globbing)/i,
  /^\s*●\s+(Read|Edit|Write|Bash|Grep|Glob|Task)/i,
  /^\s*[▸▹►▻→]\s+/,  // Arrow prefixed tool indicators
];

// Status and UI patterns to filter out
const STATUS_PATTERNS = [
  /^▐▛███▜▌/,  // Claude Code header
  /^╭─+╮$/,    // Box drawing top
  /^╰─+╯$/,    // Box drawing bottom
  /^│\s*│$/,   // Empty box line
  /^[─━═┄┈\-]{3,}$/,  // Divider lines
  /^\s*\d+\s*│/,  // Line numbers (code display)
  /^ctrl\+[a-z]/i,  // Keyboard shortcuts
  /^\?\s+for shortcuts/,
  /^>\s*$/,    // Empty prompt
  /^\.{3,}$/,  // Ellipsis loading
  /^\s*⠋|⠙|⠹|⠸|⠼|⠴|⠦|⠧|⠇|⠏/,  // Spinner characters
  /^\s*\[\s*\d+\/\d+\s*\]/,  // Progress indicators like [1/5]
  /^Tokens:/i,  // Token count
  /^Cost:/i,    // Cost display
  /^\s*↳/,      // Sub-item indicator
  /^\s*\(.*working.*\)/i,  // Working indicators
  /^Auto-approved/i,  // Auto-approval messages
  /^\s*Session:/i,  // Session info
];

// Patterns that indicate tool output (file contents, command output)
const TOOL_OUTPUT_PATTERNS = [
  /^\s+\d+[│|]\s/,  // File content with line numbers
  /^[+\-]{3}\s+[ab]\//,  // Diff headers
  /^@@.*@@/,  // Diff hunk markers
  /^diff --git/,  // Git diff header
  /^index [0-9a-f]+\.\.[0-9a-f]+/,  // Git index line
];

// Check if a line is a tool call or status indicator
function isToolOrStatusLine(line: string): boolean {
  const stripped = stripAnsi(line).trim();
  if (!stripped) return false;

  for (const pattern of [...TOOL_PATTERNS, ...STATUS_PATTERNS, ...TOOL_OUTPUT_PATTERNS]) {
    if (pattern.test(stripped)) return true;
  }
  return false;
}

// Extract clean conversational content from Claude output
export function extractCleanContent(text: string): string {
  const stripped = stripAnsi(text);
  const lines = stripped.split('\n');

  const cleanLines: string[] = [];
  let inToolBlock = false;
  let inCodeBlock = false;
  let consecutiveEmptyLines = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Track code blocks (should be preserved)
    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      cleanLines.push(line);
      consecutiveEmptyLines = 0;
      continue;
    }

    // Inside code block - preserve as-is
    if (inCodeBlock) {
      cleanLines.push(line);
      consecutiveEmptyLines = 0;
      continue;
    }

    // Detect tool block start
    if (TOOL_PATTERNS.some(p => p.test(trimmed))) {
      inToolBlock = true;
      continue;
    }

    // Detect tool block end (empty line or new conversational content)
    if (inToolBlock && (!trimmed || /^[A-Z][a-z]/.test(trimmed))) {
      inToolBlock = false;
    }

    // Skip tool/status lines
    if (isToolOrStatusLine(line)) {
      continue;
    }

    // Skip tool block content
    if (inToolBlock) {
      continue;
    }

    // Handle empty lines - allow max 2 consecutive
    if (!trimmed) {
      consecutiveEmptyLines++;
      if (consecutiveEmptyLines <= 2 && cleanLines.length > 0) {
        cleanLines.push('');
      }
      continue;
    }

    consecutiveEmptyLines = 0;
    cleanLines.push(line);
  }

  // Trim leading/trailing empty lines
  while (cleanLines.length > 0 && !cleanLines[0].trim()) {
    cleanLines.shift();
  }
  while (cleanLines.length > 0 && !cleanLines[cleanLines.length - 1].trim()) {
    cleanLines.pop();
  }

  return cleanLines.join('\n');
}

// Check if content appears to be a question from Claude
export function containsQuestion(text: string): boolean {
  const stripped = stripAnsi(text);
  // Look for question marks in conversational context
  return /\?\s*$/.test(stripped) || /would you like/i.test(stripped) || /shall I/i.test(stripped);
}
