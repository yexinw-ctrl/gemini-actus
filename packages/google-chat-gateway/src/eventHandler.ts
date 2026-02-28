/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { askAgent } from './agentClient.js';
import { sendAsyncMessage } from './chatApi.js';
import { logger } from './logger.js';

interface ChatEvent {
  chat?: {
    messagePayload?: {
      message?: {
        argumentText?: string;
        text?: string;
        thread?: { name?: string };
      };
      space?: { name?: string };
    };
  };
  type?: string;
  message?: {
    text?: string;
    thread?: { name?: string };
  };
  space?: { name?: string };
}

/**
 * Handle incoming Google Chat events (both HTTP webhook and Pub/Sub).
 */
export async function handleChatEvent(
  event: ChatEvent,
): Promise<{ text?: string } | void> {
  // Handler for the new Google Chat API interaction structure
  if (event.chat && event.chat.messagePayload) {
    const messagePayload = event.chat.messagePayload;
    if (messagePayload.message) {
      const text =
        messagePayload.message.argumentText ||
        messagePayload.message.text ||
        '';
      const spaceName = messagePayload.space?.name;
      const threadName = messagePayload.message.thread?.name;

      if (text && spaceName && threadName) {
        // Send the prompt to the core agent and then reply asynchronously
        askAgent(text)
          .then((agentResponse) => {
            if (agentResponse.text) {
              return sendAsyncMessage(
                spaceName,
                threadName,
                agentResponse.text,
              );
            }
            return;
          })
          .catch((err) => {
            logger.error('Background agent processing error:', err);
          });
      }
      return;
    }
  }

  // Fallback for legacy event format
  if (event.type === 'ADDED_TO_SPACE') {
    return {
      text: 'Hello! I am the Gemini Actus gateway bot. Thanks for adding me!',
    };
  }

  if (event.type === 'MESSAGE' && event.message) {
    const text = event.message.text || '';
    const spaceName = event.space?.name;
    const threadName = event.message.thread?.name;

    if (spaceName && threadName) {
      // Send the prompt to the core agent and then reply asynchronously
      askAgent(text)
        .then((agentResponse) => {
          if (agentResponse.text) {
            return sendAsyncMessage(spaceName, threadName, agentResponse.text);
          }
          return;
        })
        .catch((err) => {
          logger.error('Background agent processing error:', err);
        });
    }
    return;
  }
}
