import type { Client, UserObjectResponse, RichTextItemResponse } from '@notionhq/client';

export type NotionClient = Client;

// Define the date structure based on Notion's date format
export interface NotionDateValue {
  start: string;
  end: string | null;
  time_zone: string | null;
}

// Use the SDK's built-in types for common properties
export interface NotionDateProperty {
  id: string;
  type: 'date';
  date: NotionDateValue | null;
}

export interface NotionSelectProperty {
  id: string;
  type: 'select';
  select: {
    id: string;
    name: string;
    color: string;
  } | null;
}

export interface NotionPeopleProperty {
  id: string;
  type: 'people';
  people: UserObjectResponse[]; // Uses SDK's UserObjectResponse type
}

export interface NotionRichTextProperty {
  id: string;
  type: 'rich_text';
  rich_text: RichTextItemResponse[]; // Uses SDK's RichTextItemResponse type
}

export interface NotionOncallScheduleProperties {
  Date: NotionDateProperty;
  Rotation: NotionSelectProperty;
  'Orig. Engineer': NotionPeopleProperty;
  Override: NotionPeopleProperty;
  'Final Engineer': NotionRichTextProperty;
}

export interface NotionPageCreateRequest {
  parent: {
    database_id: string;
  };
  properties: Partial<NotionOncallScheduleProperties>;
}

export interface NotionPageUpdateRequest {
  properties: Partial<NotionOncallScheduleProperties>;
}

export interface NotionDatabaseQueryResponse {
  object: 'list';
  results: Array<{
    id: string;
    created_time: string;
    last_edited_time: string;
    properties: NotionOncallScheduleProperties;
    archived: boolean;
  }>;
  next_cursor: string | null;
  has_more: boolean;
}

export interface NotionErrorResponse {
  object: 'error';
  status: number;
  code: string;
  message: string;
}

export interface NotionUser {
  id: string;
  name?: string;
  avatar_url?: string;
  type: 'person' | 'bot';
  person?: {
    email: string;
  };
  bot?: {
    owner: {
      type: 'workspace' | 'user';
    };
    workspace_name?: string;
  };
}

export interface NotionUsersListResponse {
  object: 'list';
  results: NotionUser[];
  next_cursor: string | null;
  has_more: boolean;
}

export type RotationType = 'AM' | 'Core' | 'PM';

export interface OncallScheduleEntry {
  date: string;
  rotation: RotationType;
  originalEngineer: string;
  overrideEngineer?: string;
  finalEngineer: string;
  startDateTime: string;
  endDateTime: string;
}

export interface PersonLookupCache {
  emailToPersonId: Record<string, string | null>;
  personIdToInfo: Record<string, { email: string; name: string }>;
}
