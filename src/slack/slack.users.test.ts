import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSlackUserIdByEmail } from './slack.users.js';
import { GhostEngPod } from '../schedule/schedule.types.js';

// Mock the dependencies
vi.mock('./slack.client.js', () => ({
  slackClient: {
    users: {
      lookupByEmail: vi.fn(),
    },
  },
}));

vi.mock('../database/queries.js', () => ({
  getUserByEmail: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock('../logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

import { slackClient } from './slack.client.js';
import { getUserByEmail, updateUser } from '../database/queries.js';

describe('slack.users', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getSlackUserIdByEmail', () => {
    const testEmail = 'test@example.com';
    const testSlackId = 'U123456789';

    it('should return cached Slack user ID when found in database', async () => {
      // Mock database cache hit
      vi.mocked(getUserByEmail).mockReturnValue({
        email: testEmail,
        name: 'Test User',
        slack_user_id: testSlackId,
        notion_person_id: null,
        rotation: 'AM',
        pod: GhostEngPod.Blinky,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      });

      const result = await getSlackUserIdByEmail(testEmail);

      expect(result).toBe(testSlackId);
      expect(getUserByEmail).toHaveBeenCalledWith(testEmail);
      expect(slackClient.users.lookupByEmail).not.toHaveBeenCalled();
      expect(updateUser).not.toHaveBeenCalled();
    });

    it('should call Slack API and cache result when not in database', async () => {
      // Mock database cache miss
      vi.mocked(getUserByEmail).mockReturnValue({
        email: testEmail,
        name: 'Test User',
        slack_user_id: null,
        notion_person_id: null,
        rotation: 'AM',
        pod: GhostEngPod.Blinky,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      });

      // Mock Slack API response
      vi.mocked(slackClient.users.lookupByEmail).mockResolvedValue({
        ok: true,
        user: { id: testSlackId },
      });

      const result = await getSlackUserIdByEmail(testEmail);

      expect(result).toBe(testSlackId);
      expect(getUserByEmail).toHaveBeenCalledWith(testEmail);
      expect(slackClient.users.lookupByEmail).toHaveBeenCalledWith({ email: testEmail });
      expect(updateUser).toHaveBeenCalledWith(testEmail, { slack_user_id: testSlackId });
    });

    it('should handle case when user not found in database at all', async () => {
      // Mock database returning null (user not found)
      vi.mocked(getUserByEmail).mockReturnValue(null);

      // Mock Slack API response
      vi.mocked(slackClient.users.lookupByEmail).mockResolvedValue({
        ok: true,
        user: { id: testSlackId },
      });

      const result = await getSlackUserIdByEmail(testEmail);

      expect(result).toBe(testSlackId);
      expect(getUserByEmail).toHaveBeenCalledWith(testEmail);
      expect(slackClient.users.lookupByEmail).toHaveBeenCalledWith({ email: testEmail });
      expect(updateUser).toHaveBeenCalledWith(testEmail, { slack_user_id: testSlackId });
    });

    it('should return undefined when Slack API returns no user', async () => {
      // Mock database cache miss
      vi.mocked(getUserByEmail).mockReturnValue(null);

      // Mock Slack API response with no user
      vi.mocked(slackClient.users.lookupByEmail).mockResolvedValue({
        ok: true,
        user: undefined,
      });

      const result = await getSlackUserIdByEmail(testEmail);

      expect(result).toBeUndefined();
      expect(updateUser).not.toHaveBeenCalled();
    });

    it('should handle database update failures gracefully', async () => {
      // Mock database cache miss
      vi.mocked(getUserByEmail).mockReturnValue(null);

      // Mock Slack API response
      vi.mocked(slackClient.users.lookupByEmail).mockResolvedValue({
        ok: true,
        user: { id: testSlackId },
      });

      // Mock database update failure
      vi.mocked(updateUser).mockImplementation(() => {
        throw new Error('Database error');
      });

      const result = await getSlackUserIdByEmail(testEmail);

      // Should still return the Slack ID even though caching failed
      expect(result).toBe(testSlackId);
      expect(updateUser).toHaveBeenCalledWith(testEmail, { slack_user_id: testSlackId });
    });

    it('should handle Slack API errors gracefully', async () => {
      // Mock database cache miss
      vi.mocked(getUserByEmail).mockReturnValue(null);

      // Mock Slack API error
      vi.mocked(slackClient.users.lookupByEmail).mockRejectedValue(new Error('Slack API error'));

      const result = await getSlackUserIdByEmail(testEmail);

      expect(result).toBeUndefined();
      expect(updateUser).not.toHaveBeenCalled();
    });
  });
});
