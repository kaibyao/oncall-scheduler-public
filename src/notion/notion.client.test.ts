import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Client } from '@notionhq/client';

describe('notion.client', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should create notion client with valid token', async () => {
    process.env.NOTION_API_TOKEN = 'test-token';

    const { notionClient } = await import('./notion.client.js');

    expect(notionClient).toBeInstanceOf(Client);
  });

  it('should throw error when NOTION_API_TOKEN is not set', async () => {
    delete process.env.NOTION_API_TOKEN;

    await expect(async () => {
      await import('./notion.client.js');
    }).rejects.toThrow('Environment variable NOTION_API_TOKEN is not set');
  });

  it('should throw error when NOTION_API_TOKEN is empty string', async () => {
    process.env.NOTION_API_TOKEN = '';

    await expect(async () => {
      await import('./notion.client.js');
    }).rejects.toThrow('Environment variable NOTION_API_TOKEN is not set');
  });

  it('should create client with proper configuration', async () => {
    const testToken = 'secret_test123';
    process.env.NOTION_API_TOKEN = testToken;

    const { notionClient } = await import('./notion.client.js');

    expect(notionClient).toBeDefined();
    expect(notionClient).toBeInstanceOf(Client);
  });
});
