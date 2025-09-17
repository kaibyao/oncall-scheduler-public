import { IS_PRODUCTION } from '../config.js';

export enum SlackChannel {
  BACKEND_INTEGRATION_STAGING, // #backend-integration-staging
  BACKEND_INTEGRATION_DEV, // #backend-integration-dev
  EPD_SUPPORT, // #epd-support
}

// This is intentionally not exported so that it is scoped in just this file
const SlackChannelIds: { [key in SlackChannel]: string } = {
  [SlackChannel.BACKEND_INTEGRATION_DEV]: 'C04GGFUSZRA',
  [SlackChannel.BACKEND_INTEGRATION_STAGING]: 'C04JBA6S31A',
  [SlackChannel.EPD_SUPPORT]: 'C06V8C8SL2U',
};

/* Staging and dev have their own dedicated channel for all development,
whereas production will have individual channels for each one. */
export const getSlackChannel = (slackChannel: SlackChannel) => {
  if (IS_PRODUCTION) {
    return SlackChannelIds[slackChannel];
  } else {
    return SlackChannelIds[SlackChannel.BACKEND_INTEGRATION_DEV];
  }
};
