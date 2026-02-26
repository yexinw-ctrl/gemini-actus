/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Message } from '@google-cloud/pubsub';
import { PubSub } from '@google-cloud/pubsub';
import { logger } from './logger.js';
import { handleChatEvent } from './eventHandler.js';

export function startPubSubSubscriber(
  projectId: string,
  subscriptionId: string,
) {
  logger.info(
    `Starting Pub/Sub subscriber for project ${projectId}, subscription ${subscriptionId}`,
  );

  const pubsub = new PubSub({ projectId });
  const subscription = pubsub.subscription(subscriptionId);

  subscription.on('message', async (message: Message) => {
    try {
      const dataStr = message.data.toString();
      const event = JSON.parse(dataStr);
      logger.info(`Received Pub/Sub message: ${dataStr}`);

      await handleChatEvent(event);

      // Ack the message after processing
      message.ack();
    } catch (err) {
      logger.error('Error processing Pub/Sub message:', err);
      // Depending on the issue, you might want to nack or let it timeout
      // to avoid infinite retry loops on bad data. For now, we'll ack
      // if it's a parsing error or unhandleable to clear the queue,
      // or we can nack if it's a transient failure.
      message.ack();
    }
  });

  subscription.on('error', (error: Error) => {
    logger.error('Pub/Sub subscriber error:', error);
  });

  logger.info(`Listening for messages on ${subscription.name}`);
}
