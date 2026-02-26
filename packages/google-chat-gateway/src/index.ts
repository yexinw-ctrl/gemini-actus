/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import dotenv from 'dotenv';
import path from 'node:path';

// Load environment variables immediately from the root of the monorepo
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

import { logger } from './logger.js';
import { googleChatRoutes } from './routes.js';
import { startPubSubSubscriber } from './pubsub.js';

const app = express();
const port = process.env['PORT'] || 3000;

app.use(express.json());

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

app.use('/google-chat', googleChatRoutes);

// A placeholder for the direct webhook at root if necessary
app.post('/', (req, res, next) => {
  // Pass it to the googleChatRoutes
  req.url = '/webhook';
  googleChatRoutes(req, res, next);
});

const projectId = process.env['PROJECT_ID'];
const subscriptionId = process.env['SUBSCRIPTION_ID'];

if (projectId && subscriptionId) {
  startPubSubSubscriber(projectId, subscriptionId);
} else {
  logger.info(
    'PROJECT_ID or SUBSCRIPTION_ID not set. Pub/Sub subscriber will not start.',
  );
}

app.listen(port, () => {
  logger.info(`[Google Chat Gateway] Server started on port ${port}`);
});
