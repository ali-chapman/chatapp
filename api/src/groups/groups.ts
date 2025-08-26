import { Entity } from '../entity';
import { SyncStatus } from '../sync/sync';
import { User } from '../users/users';

export interface GroupMember {
  userId: string;
  username: string;
  displayName: string;
  joinedAt: string;
}

export type Group = Entity & {
  entityType: 'GROUP';
  name: string;
  description: string;
  createdAt: Date;
  createdBy: User;
  updatedAt: Date;
  isDeleted: boolean;
  members: GroupMember[];
};

export type Membership = Entity & {
  entityType: 'MEMBERSHIP';
  groupId: string;
  userId: string;
  joinedAt: Date;
  lastModified: Date;
  leftAt?: Date;
  isDeleted: boolean;
};

export interface MembershipEvent {
  id: string;
  groupId: string;
  userId: string;
  action: 'JOIN' | 'LEAVE' | 'REMOVE';
  performedBy: User;
  timestamp: Date;
  syncStatus: SyncStatus;
  createdAt: Date;
}

