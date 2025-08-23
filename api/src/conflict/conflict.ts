import { User } from '../users/users';
import { EntityType } from '../entity';
import { Group, Membership } from '../groups/groups';
import { Message } from '../messages/messages';

export interface Policy {
  id: string;
  policyName: string;
  entityType: EntityType;
  conflictType: string;
  resolutionStrategy: string;
  isActive: boolean;
  createdBy: User;
  createdAt: Date;
  updatedAt: Date;
}

export type MessageConflictType =
  | 'SEND_TO_LEFT_GROUP'
  | 'SEND_TO_DELETED_GROUP'
  | 'DUPLICATE_MESSAGE'
  | 'MESSAGE_ORDER_CONFLICT';

export type MessagePolicy = Policy & {
  entityType: 'MESSAGE';
  conflictType: MessageConflictType;
};

export type MembershipConflictType =
  | 'SIMULTANEOUS_LEAVE_ADD'
  | 'DUPLICATE_JOIN'
  | 'DUPLICATE_LEAVE'
  | 'LEAVE_THEN_REJOIN_SEQUENCE'
  | 'ADMIN_OVERRIDE_USER_ACTION';

export type MembershipPolicy = Policy & {
  entityType: 'MEMBERSHIP';
  conflictType: MembershipConflictType;
};

export type GroupConflictType =
  | 'SIMULTANEOUS_GROUP_CREATION'
  | 'DELETE_ACTIVE_GROUP'
  | 'MODIFY_DELETED_GROUP';

export type GroupPolicy = Policy & {
  entityType: 'GROUP';
  conflictType: GroupConflictType;
};

export interface Resolution {
  id: string;
  affectedEntity: Group | Message | Membership;
  affectedUser: User;
  conflictType: string;
  resolutionStrategy: string;
  resolvedAt: Date;
  isActive: boolean;
}