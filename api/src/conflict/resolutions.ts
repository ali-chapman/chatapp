import { Group, Membership } from '../groups/groups';
import { Message } from '../messages/messages';
import { User } from '../users/users';

export interface Resolution {
  id: string;
  affectedEntity: Group | Message | Membership;
  affectedUser: User;
  conflictType: string;
  resolutionStrategy: string;
  resolvedAt: Date;
  isActive: boolean;
}
