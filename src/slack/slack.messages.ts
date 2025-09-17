import { type Block, type ChatPostMessageResponse, type KnownBlock } from '@slack/web-api';
import { slackClient } from './slack.client.js';
import { Logger } from '../logger.js';

const logger = new Logger('slack.messages');

interface SlackMessageParams {
  channel: string;
  text: string;
  blocks?: (KnownBlock | Block)[];
  thread_ts?: string;
  unfurlLinks?: boolean;
}

export async function postSlackMessage({
  channel,
  text,
  blocks,
  thread_ts,
  unfurlLinks = true,
}: SlackMessageParams): Promise<ChatPostMessageResponse | null> {
  if (!slackClient) {
    return null;
  }

  try {
    const postMessageResult = await slackClient?.chat.postMessage({
      channel,
      text,
      blocks,
      icon_emoji: 'ghost_logo_icon_only_wht',
      username: 'Ghost',
      thread_ts,
      unfurl_links: unfurlLinks,
    });

    return postMessageResult;
  } catch (error) {
    logger.error(`Slack Error: ${error} Attempted to send: ${JSON.stringify(text)}`, { err: error });
    return null;
  }
}
