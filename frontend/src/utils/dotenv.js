/**
 * Parses pasted .env text into { NAME: value }: "KEY=value" lines, # comments, `export KEY=...`,
 * single or double quotes (double quotes understand \n). Lines that are not assignments are skipped.
 */
export function parseDotEnv(text) {
  const vars = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    const quoted = /^(['"])([\s\S]*)\1$/.exec(value);
    if (quoted) value = quoted[1] === '"' ? quoted[2].replace(/\\n/g, '\n') : quoted[2];
    else value = value.replace(/\s+#.*$/, ''); // unquoted inline comment
    vars[match[1]] = value;
  }
  return vars;
}
