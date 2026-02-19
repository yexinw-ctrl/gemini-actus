/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import winston from 'winston';

export const logger = winston.createLogger({
  level: process.env['DEBUG'] ? 'debug' : 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.simple(),
  ),
  transports: [new winston.transports.Console()],
});
