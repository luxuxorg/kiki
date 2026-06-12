import { readFileSync, existsSync, statSync } from 'fs';

const PLACEHOLDER_PATTERNS = [
  /\bTBD\b/gi,
  /\bTODO\b/gi,
  /\bFIXME\b/gi,
  /\bXXX\b/gi,
  /\bSTUB\b/gi,
  /\bPLACEHOLDER\b/gi,
  /\bWIP\b/gi,
  /\bHACK\b/gi,
  /\bimplement later\b/gi,
  /\bfill in details?\b/gi,
  /\badd appropriate\b/gi,
  /\bhandle edge cases?\b/gi
];

export async function verify(filePath: string | undefined): Promise<void> {
  if (!filePath) {
    console.error('Usage: kiki verify <file>');
    process.exit(1);
  }

  if (!existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  if (!statSync(filePath).isFile()) {
    console.error(`${filePath} is not a file`);
    process.exit(1);
  }

  const content = readFileSync(filePath, 'utf-8');
  let found = 0;

  for (const pattern of PLACEHOLDER_PATTERNS) {
    const matches = content.match(pattern);
    if (matches) {
      console.log(`Found ${matches.length} occurrence(s) of "${pattern.source}":`);
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        pattern.lastIndex = 0;
        if (pattern.test(line)) {
          console.log(`  Line ${idx + 1}: ${line.trim()}`);
        }
      });
      found += matches.length;
    }
  }

  if (found === 0) {
    console.log('No placeholders found.');
  } else {
    console.log(`\nFound ${found} placeholder(s). Fix before proceeding.`);
    process.exit(1);
  }
}
