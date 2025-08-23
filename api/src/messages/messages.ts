import { Entity } from '../entity';
import { SyncStatus } from '../sync';
import { User } from '../users/users';

export type Message = Entity & {
  entityType: 'MESSAGE';
  localId?: string;
  groupId: string;
  user: User;
  content: string;
  messageType: 'text' | 'system';
  createdAt: Date;
  updatedAt: Date;
  syncStatus: SyncStatus;
  isDeleted: boolean;
  deletedAt?: Date;
};
