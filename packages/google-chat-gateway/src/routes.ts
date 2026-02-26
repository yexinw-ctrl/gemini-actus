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
import { handleChatEvent } from './eventHandler.js';
import { logger } from './logger.js';

const router = Router();

// To be secure, this should use verifyGoogleChatWebhook in production.
// During development, you might skip it if needed.
const authMiddleware =
  process.env['NODE_ENV'] === 'development'
    ? (req: Request, res: Response, next: NextFunction) => next()
    : verifyGoogleChatWebhook;

router.post('/webhook', authMiddleware, async (req, res) => {
  const event = req.body;
  logger.info(`Content-Type: ${req.header('content-type')}`);
  logger.info(`Full Request Body: ${JSON.stringify(event)}`);
  logger.info(`Received webhook event type: ${event.type}`);

  try {
    const syncResponse = await handleChatEvent(event);

    // Acknowledge synchronously to avoid 30s timeout
    if (syncResponse) {
      res.status(200).send(syncResponse);
    } else {
      res.status(200).send({});
    }
  } catch (err) {
    logger.error('Error handling chat event in webhook:', err);
    res.status(500).send();
  }
});

export { router as googleChatRoutes };
