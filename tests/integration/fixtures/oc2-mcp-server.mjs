// Minimal stdio MCP server for the Task 3 route probe. Local only; no network.
// The probe-counters directory is supplied by the fixture and is never a real
// service or credential.
import { appendFileSync } from 'node:fs';

const counter = process.env.PROBE_COUNTER;
const tools = [{
  name: 'echo',
  description: 'Echo a value without touching the network',
  inputSchema: { type: 'object', properties: {}, additionalProperties: true },
}];

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  buffer += chunk;
  for (;;) {
    const index = buffer.indexOf('\n');
    if (index < 0) break;
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (!line) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      continue;
    }
    if (message.method === 'initialize') {
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          protocolVersion: message.params?.protocolVersion ?? '2025-06-18',
          capabilities: { tools: {} },
          serverInfo: { name: 'route-probe', version: '1.0.0' },
        },
      });
    } else if (message.method === 'tools/list') {
      send({ jsonrpc: '2.0', id: message.id, result: { tools } });
    } else if (message.method === 'tools/call') {
      if (counter) appendFileSync(counter, 'called\n');
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: { content: [{ type: 'text', text: 'route-probe-result' }], isError: false },
      });
    } else if (message.id !== undefined) {
      send({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'method not found' } });
    }
  }
});
