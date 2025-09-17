import type { CanvasesSectionsLookupArguments } from '@slack/web-api';
import { IS_PRODUCTION, SLACK_TOKEN } from '../config.js';
import { slackClient } from './slack.client.js';

export enum GhostSlackCanvases {
  ONCALL_SCHEDULE = 'oncall_schedule',
}

const SLACK_CANVAS_IDS: Record<GhostSlackCanvases, { prod: string; nonProd: string }> = {
  [GhostSlackCanvases.ONCALL_SCHEDULE]: {
    prod: 'F094MT6Q8MU',
    nonProd: 'F094L0RAJE7',
  },
};

export function getSlackCanvasId(canvas: GhostSlackCanvases) {
  if (IS_PRODUCTION) {
    return SLACK_CANVAS_IDS[canvas].prod;
  } else {
    return SLACK_CANVAS_IDS[canvas].nonProd;
  }
}

export async function getSlackCanvasContents(
  canvas: GhostSlackCanvases,
  criteria: CanvasesSectionsLookupArguments['criteria'],
) {
  return slackClient.canvases.sections.lookup({
    token: SLACK_TOKEN,
    canvas_id: getSlackCanvasId(canvas),
    criteria,
  });
}
