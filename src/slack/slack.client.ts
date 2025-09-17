import { WebClient } from '@slack/web-api';
import { SLACK_TOKEN } from '../config.js';

if (!SLACK_TOKEN) {
  throw new Error('Environment variable SLACK_TOKEN is not set');
}

export const slackClient = new WebClient(SLACK_TOKEN);
