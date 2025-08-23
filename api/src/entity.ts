export type EntityType = 'MESSAGE' | 'MEMBERSHIP' | 'GROUP';

export interface Entity {
  id: string;
  entityType: EntityType;
}
