import express from 'express';
import { SyncService } from './service';
import { MembershipSyncRequest, MessageSyncRequest, GroupSyncRequest } from './sync';

const router = express.Router();
const syncService = new SyncService();

router.post(
  '/sync/membershipEvents',
  async (req: express.Request, res: express.Response) => {
    try {
      const { events, lastSyncTimestamp }: MembershipSyncRequest = req.body;
      const userId = req.headers['x-user-id'] as string;

      if (!userId) {
        return res.status(401).json({ error: 'User authentication required' });
      }

      const result = await syncService.syncMembershipEvents(
        userId,
        events,
        lastSyncTimestamp
      );

      return res.json(result);
    } catch (error) {
      console.error('Error in membership sync:', error);
      if (
        error instanceof Error &&
        error.message === 'Group not found or has been deleted'
      ) {
        return res.status(404).json({ error: error.message });
      }
      return res
        .status(500)
        .json({ error: 'Internal server error during sync' });
    }
  }
);

router.post(
  '/sync/messages',
  async (req: express.Request, res: express.Response) => {
    try {
      const { messages, lastSyncTimestamp }: MessageSyncRequest = req.body;
      const userId = req.headers['x-user-id'] as string;

      if (!userId) {
        return res.status(401).json({ error: 'User authentication required' });
      }

      const result = await syncService.syncMessages(
        userId,
        messages,
        lastSyncTimestamp
      );

      return res.json(result);
    } catch (error) {
      console.error('Error in message sync:', error);
      return res
        .status(500)
        .json({ error: 'Internal server error during sync' });
    }
  }
);

router.post(
  '/sync/groups',
  async (req: express.Request, res: express.Response) => {
    try {
      const { groups, lastSyncTimestamp }: GroupSyncRequest = req.body;
      const userId = req.headers['x-user-id'] as string;

      if (!userId) {
        return res.status(401).json({ error: 'User authentication required' });
      }

      const result = await syncService.syncGroups(
        userId,
        groups,
        lastSyncTimestamp
      );

      return res.json(result);
    } catch (error) {
      console.error('Error in group sync:', error);
      return res
        .status(500)
        .json({ error: 'Internal server error during sync' });
    }
  }
);

export default router;
