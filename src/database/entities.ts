import type { GhostEngPod, OncallRotationName } from '../schedule/schedule.types.js';

export interface OncallScheduleEntity {
  id: number;
  date: string;
  rotation: OncallRotationName;
  engineer_email: string;
}

export type OncallScheduleOverrideEntity = OncallScheduleEntity;

export interface UserEntity {
  email: string;
  name: string;
  slack_user_id: string | null;
  notion_person_id: string | null;
  rotation: string;
  pod: GhostEngPod;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string;
}

export type Upsertable<T> = Omit<T, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>;
