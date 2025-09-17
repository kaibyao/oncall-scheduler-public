import { vi, describe, it, beforeEach, expect } from 'vitest';

// Mock the entire module
vi.mock('./notion.databases.js', () => ({
  getNotionDatabaseId: vi.fn(),
}));

import { getNotionDatabaseId } from './notion.databases.js';

describe('notion.databases', () => {
  describe('getDatabaseId', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should get current database ID by default', () => {
      const mockGetNotionDatabaseId = vi.mocked(getNotionDatabaseId);
      const expectedDbId = '23b6859d770b8058bf6cdf1a76ea1924';
      mockGetNotionDatabaseId.mockReturnValue(expectedDbId);

      const result = getNotionDatabaseId();

      expect(mockGetNotionDatabaseId).toHaveBeenCalledWith();
      expect(result).toBe(expectedDbId);
    });

    it('should get past database ID when requested', () => {
      const mockGetNotionDatabaseId = vi.mocked(getNotionDatabaseId);
      const expectedDbId = '23b6859d770b80729043f6524a5bfaaa';
      mockGetNotionDatabaseId.mockReturnValue(expectedDbId);

      const result = getNotionDatabaseId(true);

      expect(mockGetNotionDatabaseId).toHaveBeenCalledWith(true);
      expect(result).toBe(expectedDbId);
    });
  });
});
