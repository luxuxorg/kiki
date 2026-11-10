import { createServer, type Server, type ServerResponse } from 'node:http';
import type { Socket } from 'node:net';

export interface FixtureMessage {
  role: string;
  content?: unknown;
  tool_call_id?: string;
  tool_calls?: unknown;
}

export interface FixtureRequest {
  model: string;
  messages: FixtureMessage[];
  body: Record<string, any>;
  url: string;
}

export interface FixtureToolCall {
  id?: string;
  name: string;
  arguments: Record<string, unknown>;
}

export type FixtureReply =
  | { type: 'text'; text: string }
  | { type: 'tool-calls'; calls: FixtureToolCall[] }
  | { type: 'hold' }
  | { type: 'error'; status?: number; message?: string };

export type FixtureResponder = (request: FixtureRequest) => FixtureReply;

export interface FixtureProvider {
  /** Loopback OpenAI-compatible base URL; only 127.0.0.1 is ever bound. */
  baseURL: string;
  requests(): number;
  requestsFor(model: string): number;
  bodies(): FixtureRequest[];
  /** Replace the deterministic script. */
  script(responder: FixtureResponder): void;
  /** Number of streams the client has aborted after a held response. */
  heldAborted(): number;
  stop(): Promise<void>;
}

export function hasToolResult(request: FixtureRequest): boolean {
  return request.messages.some(message =>
    message.role === 'tool'
    || (Array.isArray(message.content)
      && message.content.some((part: any) => part?.type === 'tool-result')));
}

export function subagentCall(
  agent: string,
  description: string,
  prompt: string,
  extra: Record<string, unknown> = {},
): FixtureReply {
  return {
    type: 'tool-calls',
    calls: [{
      id: `call_${agent.replace(/[^a-z0-9]/gi, '_')}_${Date.now().toString(36)}`,
      name: 'subagent',
      arguments: { agent, description, prompt, ...extra },
    }],
  };
}

function textChunks(model: string, text: string): Array<Record<string, unknown>> {
  return [
    {
      id: 'chatcmpl-fixture', object: 'chat.completion.chunk', created: 1, model,
      choices: [{ index: 0, delta: { role: 'assistant', content: text }, finish_reason: null }],
    },
    {
      id: 'chatcmpl-fixture', object: 'chat.completion.chunk', created: 1, model,
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
    },
  ];
}

function toolChunks(model: string, calls: FixtureToolCall[]): Array<Record<string, unknown>> {
  return [
    {
      id: 'chatcmpl-fixture', object: 'chat.completion.chunk', created: 1, model,
      choices: [{
        index: 0,
        delta: {
          role: 'assistant',
          tool_calls: calls.map((call, index) => ({
            index,
            id: call.id ?? `call_${index}`,
            type: 'function',
            function: { name: call.name, arguments: JSON.stringify(call.arguments) },
          })),
        },
        finish_reason: null,
      }],
    },
    {
      id: 'chatcmpl-fixture', object: 'chat.completion.chunk', created: 1, model,
      choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    },
  ];
}

function writeStream(response: ServerResponse, chunks: Array<Record<string, unknown>>): void {
  response.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });
  for (const chunk of chunks) response.write(`data: ${JSON.stringify(chunk)}\n\n`);
  response.write('data: [DONE]\n\n');
  response.end();
}

function defaultResponder(request: FixtureRequest): FixtureReply {
  if (request.model === 'fixture-title' || request.model === 'fixture-small') {
    return { type: 'text', text: 'Fixture title' };
  }
  return { type: 'text', text: 'Fixture reply' };
}

/**
 * Deterministic loopback provider. No external LLM, network, credential or
 * user provider is ever contacted; only synthetic OpenAI-compatible responses
 * are served from 127.0.0.1.
 */
export async function startFixtureProvider(
  responder: FixtureResponder = defaultResponder,
): Promise<FixtureProvider> {
  let respond = responder;
  const bodies: FixtureRequest[] = [];
  const sockets = new Set<Socket>();
  let held = 0;
  let aborted = 0;

  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', chunk => chunks.push(Buffer.from(chunk)));
    request.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (request.method === 'GET') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ object: 'list', data: [] }));
        return;
      }
      let body: Record<string, any> = {};
      try {
        body = JSON.parse(raw || '{}') as Record<string, any>;
      } catch {
        response.writeHead(400, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: { message: 'invalid fixture request' } }));
        return;
      }
      const record: FixtureRequest = {
        model: typeof body.model === 'string' ? body.model : 'fixture-model',
        messages: Array.isArray(body.messages) ? body.messages as FixtureMessage[] : [],
        body,
        url: request.url ?? '/',
      };
      bodies.push(record);
      const reply = respond(record);
      if (reply.type === 'text') {
        writeStream(response, textChunks(record.model, reply.text));
        return;
      }
      if (reply.type === 'tool-calls') {
        writeStream(response, toolChunks(record.model, reply.calls));
        return;
      }
      if (reply.type === 'error') {
        response.writeHead(reply.status ?? 500, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: { message: reply.message ?? 'fixture rejection' } }));
        return;
      }
      // Held child stream: headers and one partial chunk stay open until the
      // client (the real plugin/watchdog) aborts the request.
      held += 1;
      response.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      response.write(`data: ${JSON.stringify({
        id: 'chatcmpl-fixture', object: 'chat.completion.chunk', created: 1, model: record.model,
        choices: [{ index: 0, delta: { role: 'assistant', content: 'Held' }, finish_reason: null }],
      })}\n\n`);
      response.on('close', () => {
        aborted += 1;
      });
    });
  });
  server.on('connection', socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Fixture provider did not bind to a loopback port.');
  }

  return {
    baseURL: `http://127.0.0.1:${address.port}/v1`,
    requests: () => bodies.length,
    requestsFor: model => bodies.filter(entry => entry.model === model).length,
    bodies: () => bodies.slice(),
    script: next => { respond = next; },
    heldAborted: () => aborted,
    stop: async () => {
      for (const socket of sockets) socket.destroy();
      sockets.clear();
      await new Promise<void>(resolve => server.close(() => resolve()));
    },
  };
}

/** Provider map entry for native OC2 config using the fixture endpoint. */
export function fixtureProviderConfig(baseURL: string, models: Record<string, string>): Record<string, unknown> {
  return {
    'kiki-fixture': {
      package: '@ai-sdk/openai-compatible',
      name: 'Kiki fixture',
      settings: { baseURL, apiKey: 'fixture-placeholder' },
      models: Object.fromEntries(Object.entries(models).map(([id, name]) => [id, {
        name,
        limit: { context: 32_000, output: 2_000 },
      }])),
    },
  };
}
