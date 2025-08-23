export interface ConflictPolicy {
  id: string;
  policyName: string;
  entityType: 'MESSAGE' | 'MEMBERSHIP' | 'GROUP';
  conflictType: string;
  resolutionStrategy: string;
  parameters: any;
  isActive: boolean;
  createdByAdminId: string;
  createdAt: Date;
}

export interface CreateConflictPolicyRequest {
  policyName: string;
  entityType: 'MESSAGE' | 'MEMBERSHIP' | 'GROUP';
  conflictType: string;
  resolutionStrategy: string;
  parameters?: any;
  isActive?: boolean;
}