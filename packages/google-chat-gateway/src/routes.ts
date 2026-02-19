/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import { verifyGoogleChatWebhook } from './auth.js';
import { askAgent } from './agentClient.js';
import { sendAsyncMessage } from './chatApi.js';
import { logger } from './logger.js';

const router = Router();

// To be secure, this should use verifyGoogleChatWebhook in production.
// During development, you might skip it if needed.
const authMiddleware =
  process.env['NODE_ENV'] === 'development'
    ? (req: Request, res: Response, next: NextFunction) => next()
    : verifyGoogleChatWebhook;

router.post('/webhook', authMiddleware, (req, res) => {
  const event = req.body;
  logger.info(`Content-Type: ${req.header('content-type')}`);
  logger.info(`Full Request Body: ${JSON.stringify(event)}`);
  logger.info(`Received webhook event type: ${event.type}`);

  // Handler for the new Google Chat API interaction structure
  // The log shows: { chat: { messagePayload: { ... } } }

  if (event.chat && event.chat.messagePayload) {
    const messagePayload = event.chat.messagePayload;
    if (messagePayload.message) {
      const text =
        messagePayload.message.argumentText ||
        messagePayload.message.text ||
        '';
      const spaceName = messagePayload.space?.name;
      const threadName = messagePayload.message.thread?.name;

      // Acknowledge synchronously to avoid 30s timeout
      res.status(200).send({});

      if (text && spaceName && threadName) {
        // Send the prompt to the core agent and then reply asynchronously
        askAgent(text)
          .then((agentResponse) =>
            sendAsyncMessage(spaceName, threadName, agentResponse.text),
          )
          .catch((err) => {
            logger.error('Background agent processing error:', err);
          });
      }
      return;
    }
  }

  // Fallback for legacy event format (ADD_TO_SPACE, CARD_CLICKED etc if they still use it)
  // Immediate synchronous acknowledgment for Bot added to Space
  if (event.type === 'ADDED_TO_SPACE') {
    res.status(200).send({
      text: 'Hello! I am the Gemini Actus gateway bot. Thanks for adding me!',
    });
    return;
  }

  if (event.type === 'MESSAGE' && event.message) {
    const text = event.message.text || '';
    const spaceName = event.space.name;
    const threadName = event.message.thread.name;

    // Acknowledge synchronously to avoid 30s timeout
    res.status(200).send({});

    // Send the prompt to the core agent and then reply asynchronously
    askAgent(text)
      .then((agentResponse) =>
        sendAsyncMessage(spaceName, threadName, agentResponse.text),
      )
      .catch((err) => {
        logger.error('Background agent processing error:', err);
      });
    return;
  }

  res.status(200).send();
});

export { router as googleChatRoutes };
