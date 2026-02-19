/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ClientFactory,
  ClientFactoryOptions,
  DefaultAgentCardResolver,
  RestTransportFactory,
  JsonRpcTransportFactory,
} from '@a2a-js/sdk/client';
import { v4 as uuidv4 } from 'uuid';
import { logger } from './logger.js';

export interface AgentResponse {
  text: string;
}

export async function askAgent(prompt: string): Promise<AgentResponse> {
  try {
    const port = process.env['CODER_AGENT_PORT'] || '41242';
    // The A2A server serves the card at this specific path
    const agentCardUrl = `http://localhost:${port}/.well-known/agent-card.json`;

    // In node >= 20, fetch is globally available
    const resolver = new DefaultAgentCardResolver({ fetchImpl: fetch });
    const options = ClientFactoryOptions.createFrom(
      ClientFactoryOptions.default,
      {
        transports: [
          new RestTransportFactory({ fetchImpl: fetch }),
          new JsonRpcTransportFactory({ fetchImpl: fetch }),
        ],
        cardResolver: resolver,
      },
    );

    const factory = new ClientFactory(options);
    const client = await factory.createFromUrl(agentCardUrl, '');

    const stream = client.sendMessageStream({
      message: {
        kind: 'message',
        role: 'user',
        messageId: uuidv4(),
        parts: [{ kind: 'text', text: prompt }],
      },
      configuration: { blocking: true },
    });

    let fullResponse = '';

    for await (const chunk of stream) {
      logger.info('Stream Chunk:', JSON.stringify(chunk, null, 2));

      if (chunk.kind === 'status-update') {
        if (chunk.status?.message?.parts) {
          for (const part of chunk.status.message.parts) {
            if (part.kind === 'text') {
              fullResponse += part.text;
            }
          }
        }
      } else if (chunk.kind === 'message') {
        // Handle direct message response if applicable
        for (const part of chunk.parts) {
          if (part.kind === 'text') {
            fullResponse += part.text;
          }
        }
      }
    }

    return {
      text:
        fullResponse ||
        'Finished processing, but no textual response was given.',
    };
  } catch (error) {
    logger.error('Error communicating with Agent:', error);
    return {
      text: 'Sorry, I encountered an error communicating with the agent server.',
    };
  }
}
