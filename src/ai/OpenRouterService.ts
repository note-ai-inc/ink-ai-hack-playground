// OpenRouter service - client for LLM inference via OpenRouter

import { OpenRouter } from '@openrouter/sdk';

let openRouterInstance: OpenRouter | null = null;

function getOpenRouter(): OpenRouter {
  if (!openRouterInstance) {
    const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error(
        'VITE_OPENROUTER_API_KEY is not set. ' +
        'Add it to your .env.local file (see .env.example).'
      );
    }

    openRouterInstance = new OpenRouter({
      apiKey,
      defaultHeaders: {
        'HTTP-Referer': import.meta.env.VITE_OPENROUTER_SITE_URL || window.location.origin,
        'X-OpenRouter-Title': import.meta.env.VITE_OPENROUTER_SITE_NAME || 'Ink Playground',
      },
    });
  }
  return openRouterInstance;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;
}

export interface JsonSchema {
  name: string;
  strict?: boolean;
  schema: Record<string, unknown>;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** JSON mode: 'json' for unstructured JSON, or a json_schema for structured output. */
  responseFormat?: 'json' | { type: 'json_schema'; jsonSchema: JsonSchema };
}

const DEFAULT_MODEL = 'google/gemini-2.5-flash';

/**
 * Send a chat completion request via OpenRouter.
 */
export async function chatCompletion(
  messages: ChatMessage[],
  options: ChatOptions = {},
): Promise<string> {
  const client = getOpenRouter();

  // Map our camelCase responseFormat to the SDK's expected shape
  let responseFormat: Record<string, unknown> | undefined;
  if (options.responseFormat === 'json') {
    responseFormat = { type: 'json_object' };
  } else if (options.responseFormat) {
    responseFormat = {
      type: 'json_schema',
      jsonSchema: options.responseFormat.jsonSchema,
    };
  }

  const completion = await client.chat.send({
    model: options.model ?? DEFAULT_MODEL,
    messages,
    stream: false,
    temperature: options.temperature,
    max_tokens: options.maxTokens,
    responseFormat,
  });

  return completion.choices[0]?.message?.content?.toString() ?? '';
}

/**
 * Convenience: send a chat request and parse the response as JSON.
 */
export async function chatCompletionJSON<T = unknown>(
  messages: ChatMessage[],
  options: ChatOptions = {},
): Promise<T> {
  const raw = await chatCompletion(messages, {
    ...options,
    responseFormat: options.responseFormat ?? 'json',
  });
  return JSON.parse(raw) as T;
}

/**
 * Check whether the OpenRouter API key is configured.
 */
export function isOpenRouterConfigured(): boolean {
  return !!import.meta.env.VITE_OPENROUTER_API_KEY;
}
