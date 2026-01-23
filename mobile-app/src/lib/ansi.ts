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

// Check if a string looks like concatenated words (no spaces but multiple "words")
function looksLikeConcatenatedText(text: string): boolean {
  const trimmed = text.trim();
  // Must be at least 20 chars with no spaces
  if (trimmed.length < 20 || trimmed.includes(' ')) return false;
  // Must have lowercase letters
  if (!/[a-z]/.test(trimmed)) return false;
  // Check for camelCase-like patterns (lowercase followed by uppercase)
  // or multiple word-like segments
  const wordBoundaries = trimmed.match(/[a-z][A-Z]|[a-zA-Z][.?!,][a-zA-Z]/g);
  return wordBoundaries !== null && wordBoundaries.length >= 2;
}

// Remove a concatenated version if a spaced version exists
function removeSpacelessDuplicates(text: string): string {
  const lines = text.split('\n');
  const spacedVersions = new Set<string>();

  // First pass: collect properly spaced lines (normalized)
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.includes(' ') && trimmed.length > 15) {
      // Normalize: remove all spaces and lowercase for comparison
      const normalized = trimmed.replace(/\s+/g, '').toLowerCase();
      spacedVersions.add(normalized);
    }
  }

  // Second pass: filter out concatenated versions if spaced version exists
  const filteredLines = lines.filter(line => {
    const trimmed = line.trim();
    if (looksLikeConcatenatedText(trimmed)) {
      const normalized = trimmed.toLowerCase();
      if (spacedVersions.has(normalized)) {
        return false; // Remove this line, spaced version exists
      }
    }
    return true;
  });

  return filteredLines.join('\n');
}

// Deduplicate repeated patterns within a line (e.g., "text text text" -> "text")
function deduplicateRepeatedPatterns(text: string): string {
  // First remove spaceless duplicates
  const despacedText = removeSpacelessDuplicates(text);

  const lines = despacedText.split('\n');
  const processedLines = lines.map(line => {
    // Skip short lines
    if (line.length < 30) return line;

    // Normalize multiple spaces/tabs to single space (preserve the line otherwise)
    let result = line.replace(/[ \t]+/g, ' ');

    // Simple approach: find repeated phrases using regex
    // Match phrase (3+ words) followed by same phrase
    let changed = true;
    let iterations = 0;
    while (changed && iterations < 5) {
      changed = false;
      iterations++;

      // Match sequences like "word word word word word word" where first half equals second half
      const match = result.match(/\b((?:\S+\s+){2,10}\S+)(\s+\1)+/i);
      if (match) {
        result = result.replace(new RegExp('(' + escapeRegex(match[1]) + ')(\\s+\\1)+', 'gi'), '$1');
        changed = true;
      }
    }

    return result;
  });
  return processedLines.join('\n');
}

// Helper to escape regex special characters
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
// Exported so it can be used by extractCleanContent as well
export function preprocessTerminal(text: string): string {
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

// Tool names that Claude Code uses - must match tool call FORMAT, not just the word
// These patterns are intentionally strict to avoid filtering Claude's conversational text
const TOOL_PATTERNS = [
  /^\s*●\s+(Read|Edit|Write|Bash|Grep|Glob|Task)/i,  // Bullet-prefixed tool calls
  /^\s*[▸▹►▻→]\s+(Read|Edit|Write|Bash|Grep|Glob|Task|WebFetch|WebSearch)/i,  // Arrow prefixed tool indicators
];

// Status and UI patterns to filter out
const STATUS_PATTERNS = [
  /^▐▛███▜▌/,  // Claude Code header
  /^╭─+╮$/,    // Box drawing top
  /^╰─+╯$/,    // Box drawing bottom
  /^│\s*│$/,   // Empty box line
  /^[─━═┄┈\-]{3,}/,  // Divider lines (may have trailing chars like >)
  /^\s*\d+\s*│/,  // Line numbers (code display)
  /^ctrl\+[a-z]/i,  // Keyboard shortcuts
  /^\?\s+for shortcuts/,
  /^>\s*$/,    // Empty prompt
  /^\.{3,}$/,  // Ellipsis loading
  /^\s*[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏✻✽✶✢·](?!\w)/,  // Spinner chars NOT followed by word (excludes ●Response)
  /^\s*●\s*$/,  // ● alone on a line (status indicator, not response)
  /Brewing|Waiting|Kneading|Misting|Seasoning|Cooked|Dilly-dallying|Hullaballooing/i,  // Claude status words
  /^\s*\[\s*\d+\/\d+\s*\]/,  // Progress indicators like [1/5]
  /^Tokens:/i,  // Token count
  /^Cost:/i,    // Cost display
  /^\s*↳/,      // Sub-item indicator
  /^\s*\(.*working.*\)/i,  // Working indicators
  /^Auto-approved/i,  // Auto-approval messages
  /^\s*Session:/i,  // Session info
  /^0;/,  // OSC remnants (window title sequences)
  /↵\s*send/i,  // Send button UI artifact
  /^\s*https:\/\/docs\.anthropic\.com/,  // Anthropic docs URL (UI hint)
  /^.*claude install.*$/i,  // Installation hint (whole line)
  /^\s*[▘▝▛▜]/,  // Box drawing fragments
  /esc to interrupt/i,  // Interrupt hint
  /^\s*for more options/i,  // Options hint (at start)
  /^>\s*Try "/i,  // Suggestion prefix (at prompt)
  /^\s*⎿/,  // Tool output indicator
  /Tip:\s*Hit/i,  // Tip messages
  /ctrl\+[a-z]\s+to\s+/i,  // Ctrl shortcut hints
  /shift\+tab/i,  // Shift+tab hint
  /^\s*Read\([^)]+\)$/,  // Read tool indicator (entire line is just the tool call)
  /^\s*Glob\([^)]+\)$/,  // Glob tool indicator (entire line is just the tool call)
  /^\s*Bash\([^)]+\)$/,  // Bash tool indicator (entire line is just the tool call)
  /\+\d+\s+more tool/i,  // More tools indicator
  /run in background/i,  // Background hint
  /\[CONTEXT FROM PREVIOUS SESSION/i,  // Session context injection
  /=== Previous Session Context/i,  // Session context header
  /=== End of Previous Context/i,  // Session context footer
  /\[END OF PREVIOUS CONTEXT/i,  // Session context footer variant
  /---\s*Session from \d/,  // Session timestamp line
  // Menu navigation UI patterns
  /Enter to select/i,  // Selection hint
  /Tab\/Arrow keys to navigate/i,  // Navigation hint
  /Arrow keys to navigate/i,  // Navigation hint variant
  /Esc to cancel/i,  // Cancel hint
  /^>\s*\d+\./,  // Menu option indicator like ">1."
  /^\s*\d+\.\s+\w+.*\n.*\d+\.\s+\w+/,  // Multiple menu options on same line
  /^>?[A-Za-z]+ MCP\s+[A-Za-z]+ MCP/,  // Repeated MCP options (menu redraw)
  /^>?Not sure\s+(Type something|Not sure)/i,  // Repeated menu options
  /^>?Type something\s+(Not sure|Type something)/i,  // Repeated menu options
  /^>?Playwright.*Puppeteer/i,  // Menu options running together
  /^>?Puppeteer.*Playwright/i,  // Menu options running together
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
  // First apply full preprocessing (deduplication, OSC stripping, etc.)
  const preprocessed = preprocessTerminal(text);
  const stripped = stripAnsi(preprocessed);
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
    // Match lines starting with capital letter (including "I'll", "I've", etc.)
    if (inToolBlock && (!trimmed || /^[A-Z]/.test(trimmed))) {
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

  // Remove duplicate lines - keep only the last occurrence of each unique line
  const seenLines = new Map<string, number>();
  for (let i = 0; i < cleanLines.length; i++) {
    const normalized = cleanLines[i].trim().toLowerCase();
    if (normalized.length > 10) {  // Only dedupe substantial lines
      seenLines.set(normalized, i);
    }
  }
  const dedupedLines = cleanLines.filter((line, index) => {
    const normalized = line.trim().toLowerCase();
    if (normalized.length <= 10) return true;  // Keep short lines
    return seenLines.get(normalized) === index;  // Keep only last occurrence
  });

  // Also remove consecutive duplicate lines (case-insensitive)
  const finalLines: string[] = [];
  for (const line of dedupedLines) {
    const normalized = line.trim().toLowerCase();
    const lastNormalized = finalLines.length > 0 ? finalLines[finalLines.length - 1].trim().toLowerCase() : '';
    if (normalized !== lastNormalized || normalized.length === 0) {
      finalLines.push(line);
    }
  }

  const result = finalLines.join('\n');

  // If no clean content found, return a placeholder
  if (!result.trim()) {
    return 'Waiting for Claude response...\n\n(Switch to Raw View to see full terminal output)';
  }

  return result;
}

// Check if content appears to be a question from Claude
export function containsQuestion(text: string): boolean {
  const stripped = stripAnsi(text);
  // Look for question marks in conversational context
  return /\?\s*$/.test(stripped) || /would you like/i.test(stripped) || /shall I/i.test(stripped);
}
