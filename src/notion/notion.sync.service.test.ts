/**
 * Unit tests for NotionSyncService manager name resolution functionality
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotionSyncService } from './notion.sync.service.js';
import type { OncallScheduleEntry } from './notion.types.js';

// Mock all external dependencies
vi.mock('../logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

vi.mock('../config.js', () => ({
  NOTION_API_TOKEN: 'mock-token',
}));

vi.mock('./notion.user.service.js', () => ({
  NotionUserService: vi.fn().mockImplementation(() => ({
    fetchAllUsers: vi.fn(),
  })),
}));

vi.mock('./notion.database.service.js', () => ({
  NotionDatabaseService: vi.fn().mockImplementation(() => ({
    queryNotionDatabase: vi.fn(),
    createNotionEntry: vi.fn(),
    updateNotionEntry: vi.fn(),
    archiveNotionEntry: vi.fn(),
    rateLimitDelay: vi.fn(),
  })),
}));

vi.mock('../utils/schedule-data.js', () => ({
  getCompleteScheduleData: vi.fn(),
  filterOnlyPastEntries: vi.fn(),
  filterScheduleDataByDateRange: vi.fn(),
  getAllScheduleData: vi.fn(),
  getScheduleDataWithOverrides: vi.fn(),
  formatScheduleEntryWithDateTime: vi.fn(),
  isPastDate: vi.fn(),
  isInCurrentBusinessWeek: vi.fn(),
}));

describe('NotionSyncService Manager Name Resolution', () => {
  let syncService: NotionSyncService;

  beforeEach(() => {
    vi.clearAllMocks();
    syncService = new NotionSyncService();
  });

  describe('resolveEngineerDisplayName functionality', () => {
    it('should resolve manager emails correctly using the constants', () => {
      // Test direct manager resolution
      const resolveMethod = (
        syncService as unknown as { resolveEngineerDisplayName: (email: string) => string }
      ).resolveEngineerDisplayName.bind(syncService);

      expect(resolveMethod('eng.director@company.com')).toBe('Eng Director');
      expect(resolveMethod('zero-manager@company.com')).toBe('Zero Manager');
      expect(resolveMethod('blinky-manager@company.com')).toBe('Blinky Manager');
      expect(resolveMethod('regular.engineer@company.com')).toBe('regular.engineer@company.com');
    });
  });

  describe('needsUpdate functionality', () => {
    it('should detect differences between local and notion entries', () => {
      const localEntry: OncallScheduleEntry = {
        date: '2025-08-11',
        rotation: 'AM',
        originalEngineer: 'Eng Director', // Resolved manager name
        finalEngineer: 'Eng Director',
        startDateTime: '2025-08-11T09:00:00-07:00',
        endDateTime: '2025-08-11T12:00:00-07:00',
      };

      const notionEntry: OncallScheduleEntry = {
        date: '2025-08-11',
        rotation: 'AM',
        originalEngineer: 'eng.director@company.com', // Email that should resolve to Eng Director
        finalEngineer: 'eng.director@company.com',
        startDateTime: '2025-08-11T09:00:00-07:00',
        endDateTime: '2025-08-11T12:00:00-07:00',
      };

      const needsUpdateMethod = (
        syncService as unknown as { needsUpdate: (local: OncallScheduleEntry, notion: OncallScheduleEntry) => boolean }
      ).needsUpdate.bind(syncService);
      const result = needsUpdateMethod(localEntry, notionEntry);

      // Should NOT need update because eng.director@company.com resolves to Eng Director
      expect(result).toBe(false);
    });
  });

  describe('compareScheduleEntries with Manager Resolution', () => {
    it('should NOT update when manager emails resolve to same names as local', () => {
      const localEntries: OncallScheduleEntry[] = [
        {
          date: '2025-08-11',
          rotation: 'AM',
          originalEngineer: 'Eng Director', // Resolved manager name
          finalEngineer: 'Eng Director',
          startDateTime: '2025-08-11T09:00:00-07:00',
          endDateTime: '2025-08-11T12:00:00-07:00',
        },
      ];

      const notionEntries: Array<OncallScheduleEntry & { notionPageId: string }> = [
        {
          date: '2025-08-11',
          rotation: 'AM',
          originalEngineer: 'eng.director@company.com', // Email resolves to 'Eng Director'
          finalEngineer: 'eng.director@company.com', // Email resolves to 'Eng Director'
          startDateTime: '2025-08-11T09:00:00-07:00',
          endDateTime: '2025-08-11T12:00:00-07:00',
          notionPageId: 'test-page-id',
        },
      ];

      const result = syncService.compareScheduleEntries(localEntries, notionEntries);

      // Should NOT need update because emails resolve to same names as local
      expect(result.toUpdate).toHaveLength(0);
    });

    it('should detect when manager names actually differ', () => {
      const localEntries: OncallScheduleEntry[] = [
        {
          date: '2025-08-11',
          rotation: 'AM',
          originalEngineer: 'Eng Director', // Manager name
          finalEngineer: 'Eng Director',
          startDateTime: '2025-08-11T09:00:00-07:00',
          endDateTime: '2025-08-11T12:00:00-07:00',
        },
      ];

      const notionEntries: Array<OncallScheduleEntry & { notionPageId: string }> = [
        {
          date: '2025-08-11',
          rotation: 'AM',
          originalEngineer: 'Wrong Name', // Different name
          finalEngineer: 'Wrong Name',
          startDateTime: '2025-08-11T09:00:00-07:00',
          endDateTime: '2025-08-11T12:00:00-07:00',
          notionPageId: 'test-page-id',
        },
      ];

      const result = syncService.compareScheduleEntries(localEntries, notionEntries);

      expect(result.toUpdate).toHaveLength(1);
      expect(result.toUpdate[0].originalEngineer).toBe('Eng Director');
      expect(result.toUpdate[0].finalEngineer).toBe('Eng Director');
      expect(result.toUpdate[0].notionPageId).toBe('test-page-id');
    });

    it('should not update when manager names already match', () => {
      const localEntries: OncallScheduleEntry[] = [
        {
          date: '2025-08-12',
          rotation: 'PM',
          originalEngineer: 'Zero Manager', // Already resolved manager name
          finalEngineer: 'Zero Manager',
          startDateTime: '2025-08-12T18:00:00-07:00',
          endDateTime: '2025-08-12T21:00:00-07:00',
        },
      ];

      const notionEntries: Array<OncallScheduleEntry & { notionPageId: string }> = [
        {
          date: '2025-08-12',
          rotation: 'PM',
          originalEngineer: 'Zero Manager', // Already resolved
          finalEngineer: 'Zero Manager',
          startDateTime: '2025-08-12T18:00:00-07:00',
          endDateTime: '2025-08-12T21:00:00-07:00',
          notionPageId: 'test-page-id-2',
        },
      ];

      const result = syncService.compareScheduleEntries(localEntries, notionEntries);

      expect(result.toUpdate).toHaveLength(0);
      expect(result.toCreate).toHaveLength(0);
      expect(result.toDelete).toHaveLength(0);
    });

    it('should NOT update when override emails resolve to same names as local', () => {
      const localEntries: OncallScheduleEntry[] = [
        {
          date: '2025-08-13',
          rotation: 'Core',
          originalEngineer: 'regular.engineer@company.com',
          overrideEngineer: 'Blinky Manager', // Resolved manager name
          finalEngineer: 'Blinky Manager',
          startDateTime: '2025-08-13T12:00:00-07:00',
          endDateTime: '2025-08-13T18:00:00-07:00',
        },
      ];

      const notionEntries: Array<OncallScheduleEntry & { notionPageId: string }> = [
        {
          date: '2025-08-13',
          rotation: 'Core',
          originalEngineer: 'regular.engineer@company.com',
          overrideEngineer: 'blinky-manager@company.com', // Email resolves to 'Blinky Manager'
          finalEngineer: 'blinky-manager@company.com', // Email resolves to 'Blinky Manager'
          startDateTime: '2025-08-13T12:00:00-07:00',
          endDateTime: '2025-08-13T18:00:00-07:00',
          notionPageId: 'override-test-id',
        },
      ];

      const result = syncService.compareScheduleEntries(localEntries, notionEntries);

      // Should NOT need update because blinky-manager@company.com resolves to 'Blinky Manager'
      expect(result.toUpdate).toHaveLength(0);
    });

    it('should detect when override names actually differ', () => {
      const localEntries: OncallScheduleEntry[] = [
        {
          date: '2025-08-13',
          rotation: 'Core',
          originalEngineer: 'regular.engineer@company.com',
          overrideEngineer: 'Blinky Manager', // Manager name
          finalEngineer: 'Blinky Manager',
          startDateTime: '2025-08-13T12:00:00-07:00',
          endDateTime: '2025-08-13T18:00:00-07:00',
        },
      ];

      const notionEntries: Array<OncallScheduleEntry & { notionPageId: string }> = [
        {
          date: '2025-08-13',
          rotation: 'Core',
          originalEngineer: 'regular.engineer@company.com',
          overrideEngineer: 'Wrong Manager', // Different name
          finalEngineer: 'Wrong Manager',
          startDateTime: '2025-08-13T12:00:00-07:00',
          endDateTime: '2025-08-13T18:00:00-07:00',
          notionPageId: 'override-test-id',
        },
      ];

      const result = syncService.compareScheduleEntries(localEntries, notionEntries);

      expect(result.toUpdate).toHaveLength(1);
      expect(result.toUpdate[0].overrideEngineer).toBe('Blinky Manager');
      expect(result.toUpdate[0].finalEngineer).toBe('Blinky Manager');
    });

    it('should handle mixed manager and regular engineer entries', () => {
      const localEntries: OncallScheduleEntry[] = [
        {
          date: '2025-08-14',
          rotation: 'AM',
          originalEngineer: 'Eng Director', // Manager
          finalEngineer: 'Eng Director',
          startDateTime: '2025-08-14T09:00:00-07:00',
          endDateTime: '2025-08-14T12:00:00-07:00',
        },
        {
          date: '2025-08-14',
          rotation: 'PM',
          originalEngineer: 'regular.engineer@company.com', // Regular engineer
          finalEngineer: 'regular.engineer@company.com',
          startDateTime: '2025-08-14T18:00:00-07:00',
          endDateTime: '2025-08-14T21:00:00-07:00',
        },
      ];

      const notionEntries: Array<OncallScheduleEntry & { notionPageId: string }> = [
        {
          date: '2025-08-14',
          rotation: 'AM',
          originalEngineer: 'Eng Director', // Already correct
          finalEngineer: 'Eng Director',
          startDateTime: '2025-08-14T09:00:00-07:00',
          endDateTime: '2025-08-14T12:00:00-07:00',
          notionPageId: 'manager-entry-id',
        },
        {
          date: '2025-08-14',
          rotation: 'PM',
          originalEngineer: 'regular.engineer@company.com', // Already correct
          finalEngineer: 'regular.engineer@company.com',
          startDateTime: '2025-08-14T18:00:00-07:00',
          endDateTime: '2025-08-14T21:00:00-07:00',
          notionPageId: 'engineer-entry-id',
        },
      ];

      const result = syncService.compareScheduleEntries(localEntries, notionEntries);

      // Should be no updates needed since both are already correct
      expect(result.toUpdate).toHaveLength(0);
      expect(result.toCreate).toHaveLength(0);
      expect(result.toDelete).toHaveLength(0);
    });

    it('should create new entries with proper manager name resolution', () => {
      const localEntries: OncallScheduleEntry[] = [
        {
          date: '2025-08-15',
          rotation: 'Core',
          originalEngineer: 'Zero Manager', // Manager name (resolved)
          finalEngineer: 'Zero Manager',
          startDateTime: '2025-08-15T12:00:00-07:00',
          endDateTime: '2025-08-15T18:00:00-07:00',
        },
      ];

      const notionEntries: Array<OncallScheduleEntry & { notionPageId: string }> = [];

      const result = syncService.compareScheduleEntries(localEntries, notionEntries);

      expect(result.toCreate).toHaveLength(1);
      expect(result.toCreate[0].originalEngineer).toBe('Zero Manager');
      expect(result.toCreate[0].finalEngineer).toBe('Zero Manager');
    });

    it('should identify entries to delete when they exist in Notion but not locally', () => {
      const localEntries: OncallScheduleEntry[] = [];

      const notionEntries: Array<OncallScheduleEntry & { notionPageId: string }> = [
        {
          date: '2025-08-16',
          rotation: 'AM',
          originalEngineer: 'Blinky Manager',
          finalEngineer: 'Blinky Manager',
          startDateTime: '2025-08-16T09:00:00-07:00',
          endDateTime: '2025-08-16T12:00:00-07:00',
          notionPageId: 'outdated-manager-entry',
        },
      ];

      const result = syncService.compareScheduleEntries(localEntries, notionEntries);

      expect(result.toDelete).toHaveLength(1);
      expect(result.toDelete[0].notionPageId).toBe('outdated-manager-entry');
    });

    it('should handle undefined override engineers correctly', () => {
      const localEntries: OncallScheduleEntry[] = [
        {
          date: '2025-08-17',
          rotation: 'PM',
          originalEngineer: 'Eng Director',
          // No overrideEngineer
          finalEngineer: 'Eng Director',
          startDateTime: '2025-08-17T18:00:00-07:00',
          endDateTime: '2025-08-17T21:00:00-07:00',
        },
      ];

      const notionEntries: Array<OncallScheduleEntry & { notionPageId: string }> = [
        {
          date: '2025-08-17',
          rotation: 'PM',
          originalEngineer: 'Eng Director',
          // No overrideEngineer
          finalEngineer: 'Eng Director',
          startDateTime: '2025-08-17T18:00:00-07:00',
          endDateTime: '2025-08-17T21:00:00-07:00',
          notionPageId: 'no-override-id',
        },
      ];

      const result = syncService.compareScheduleEntries(localEntries, notionEntries);

      expect(result.toUpdate).toHaveLength(0);
    });

    it('should handle empty arrays gracefully', () => {
      const result = syncService.compareScheduleEntries([], []);

      expect(result.toCreate).toHaveLength(0);
      expect(result.toUpdate).toHaveLength(0);
      expect(result.toDelete).toHaveLength(0);
    });
  });
});
