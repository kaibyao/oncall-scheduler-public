import { Client } from '@notionhq/client';
import { NOTION_API_TOKEN } from '../config.js';
import { Logger } from '../logger.js';

if (!NOTION_API_TOKEN) {
  throw new Error('Environment variable NOTION_API_TOKEN is not set');
}

const logger = new Logger('notion-client');

export const notionClient = new Client({
  auth: NOTION_API_TOKEN,
  logger: (level, message, extraInfo) => {
    logger[level](message, extraInfo);
  },
});
