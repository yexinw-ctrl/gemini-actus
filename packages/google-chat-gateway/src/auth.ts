/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { OAuth2Client } from 'google-auth-library';
import type { Request, Response, NextFunction } from 'express';
import { logger } from './logger.js';

const BEARER_PREFIX = 'Bearer ';
// Valid issuers can be the standard chat system account OR the specific service account for the project's add-on
const CHAT_ISSUER_SUFFIX = '@gcp-sa-gsuiteaddons.iam.gserviceaccount.com';
const STANDARD_CHAT_ISSUER = 'chat@system.gserviceaccount.com';
const client = new OAuth2Client();

export async function verifyGoogleChatWebhook(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.header('Authorization');
  if (!authHeader || !authHeader.startsWith(BEARER_PREFIX)) {
    logger.warn('Missing or invalid Authorization header');
    res.status(401).send('Unauthorized: Missing token');
    return;
  }

  const token = authHeader.substring(BEARER_PREFIX.length);
  const targetAudience =
    process.env['GOOGLE_CHAT_TARGET_AUDIENCE'] ||
    process.env['GOOGLE_CLOUD_PROJECT_NUMBER'];

  if (!targetAudience) {
    logger.error(
      'Target audience not configured! Set GOOGLE_CHAT_TARGET_AUDIENCE or GOOGLE_CLOUD_PROJECT_NUMBER.',
    );
    res.status(500).send('Server configuration error');
    return;
  }

  // Google Chat may sign the token with the Project Number OR the Webhook URL as the audience.
  // We should check if the audience matches our Project Number OR if it matches the `audience` claim in the payload
  // which might be the URL.
  // However, verifyIdToken expects a single audience or an array of audiences.
  // Let's rely on the decoded payload for the dynamic URL case if the strict check fails,
  // OR just allow supplying multiple allowed audiences via env var.

  // Best practice: The `aud` should be the Project Number for standard Chat apps,
  // but for webhooks it might be the URL.
  // Let's parse the token first to see what the claim is, then verify it safely.
  // Actually, verifyIdToken takes an `audience` parameter which can be a string or array.

  const allowedAudiences = [
    targetAudience,
    // If the user has configured the precise webhook URL, add it here too.
    process.env['GOOGLE_CHAT_WEBHOOK_URL'],
  ].filter(Boolean) as string[];

  // If we don't have the specific URL configured, we might be too strict.
  // But let's try to verify against the Project Number first.

  logger.info(
    `Verifying token... Allowed Audiences: ${JSON.stringify(allowedAudiences)}`,
  );

  try {
    const loginTicket = await client.verifyIdToken({
      idToken: token,
      audience:
        allowedAudiences.length === 1 ? allowedAudiences[0] : allowedAudiences,
    });

    const payload = loginTicket.getPayload();
    if (!payload) {
      res.status(401).send('Unauthorized: Invalid token payload');
      return;
    }

    if (
      payload.email !== STANDARD_CHAT_ISSUER &&
      !payload.email?.endsWith(CHAT_ISSUER_SUFFIX)
    ) {
      logger.warn(`Token issued by unknown email: ${payload.email}`);
      res.status(401).send('Unauthorized: Invalid issuer');
      return;
    }

    // Token is valid
    next();
  } catch (error) {
    if (error instanceof Error && error.message.includes('Wrong recipient')) {
      // decode the token to see what the audience actually is
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        logger.error(`Expected audience: ${targetAudience}`);
        logger.error(`Actual audience in token: ${payload.aud}`);
      }
    }
    logger.warn('Failed to verify token', error);
    res.status(401).send('Unauthorized: Token verification failed');
    return;
  }
}
