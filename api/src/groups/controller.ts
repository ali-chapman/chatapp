import express from 'express';
import {
  GroupService,
  GROUP_NOT_FOUND,
  UNAUTHORIZED,
  USER_NOT_IN_GROUP,
  ALREADY_MEMBER,
} from './service';

const router = express.Router();
const groupService = new GroupService();

router.get('/groups', async (_req: express.Request, res: express.Response) => {
  try {
    console.log('Fetching all groups');
    const groups = await groupService.getAllGroups();
    res.json({ groups });
  } catch (error) {
    console.error('Error fetching groups:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch groups',
      timestamp: new Date().toISOString(),
    });
  }
});

router.post(
  '/groups',
  async (req: express.Request, res: express.Response): Promise<void> => {
    try {
      const { name, description } = req.body;
      const currentUserId = getUserId(req);

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Group name is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      console.log('Creating new group');
      const group = await groupService.createGroup(
        currentUserId,
        name,
        description
      );
      res.status(201).json(group);
    } catch (error) {
      console.error('Error creating group:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to create group',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

router.get(
  '/groups/:id',
  async (req: express.Request, res: express.Response): Promise<void> => {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'id is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      console.log(`Fetching group with id: ${id}`);

      const result = await groupService.getGroupById(id);
      handleResult(res, result);
    } catch (error) {
      console.error('Error fetching group:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to fetch group',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

router.put(
  '/groups/:id',
  async (req: express.Request, res: express.Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { name, description } = req.body;
      const currentUserId = getUserId(req);

      if (!id) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'id is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Group name is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      console.log(`Updating group with id: ${id}`);
      const result = await groupService.updateGroup(
        currentUserId,
        id,
        name,
        description
      );
      handleResult(res, result);
    } catch (error) {
      console.error('Error updating group:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to update group',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

router.delete(
  '/groups/:id',
  async (req: express.Request, res: express.Response): Promise<void> => {
    try {
      const { id } = req.params;
      const currentUserId = getUserId(req);

      if (!id) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'id is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      console.log(`Deleting group with id: ${id}`);
      const result = await groupService.deleteGroup(currentUserId, id);

      if (result === GROUP_NOT_FOUND) {
        res.status(404).json({
          error: 'Group not found',
          message: 'Group not found or has been deleted',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (result === UNAUTHORIZED) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'Only the group creator can delete the group',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      res.status(204).send();
    } catch (error) {
      console.error('Error deleting group:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to delete group',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

router.get(
  '/groups/:groupId/members',
  async (req: express.Request, res: express.Response): Promise<void> => {
    try {
      const { groupId } = req.params;

      if (!groupId) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'groupId is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      console.log(`Fetching members for group: ${groupId}`);

      const result = await groupService.getGroupMembers(groupId);

      if (result === GROUP_NOT_FOUND) {
        res.status(404).json({
          error: 'Group not found',
          message: 'Group not found or has been deleted',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      res.json({
        members: result,
        syncTimestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error fetching group members:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to fetch group members',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

router.post(
  '/groups/:groupId/members',
  async (req: express.Request, res: express.Response): Promise<void> => {
    try {
      const { groupId } = req.params;
      const currentUserId = getUserId(req);

      if (!groupId) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'groupId is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      console.log(`User ${currentUserId} joining group ${groupId}`);
      const result = await groupService.joinGroup(currentUserId, groupId);

      if (result === GROUP_NOT_FOUND) {
        res.status(404).json({
          error: 'Group not found',
          message: 'Group not found or has been deleted',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (result === ALREADY_MEMBER) {
        res.status(409).json({
          error: 'Conflict',
          message: 'User is already a member of this group',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      res.status(201).json(result);
    } catch (error) {
      console.error('Error joining group:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to join group',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

router.delete(
  '/groups/:groupId/members/:userId',
  async (req: express.Request, res: express.Response): Promise<void> => {
    try {
      const { groupId, userId } = req.params;
      const currentUserId = getUserId(req);

      if (!groupId) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'groupId is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (!userId) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'userId is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      console.log(`Removing user ${userId} from group ${groupId}`);
      const result = await groupService.removeUserFromGroup(
        currentUserId,
        groupId,
        userId
      );

      if (result === GROUP_NOT_FOUND) {
        res.status(404).json({
          error: 'Group not found',
          message: 'Group not found or has been deleted',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (result === USER_NOT_IN_GROUP) {
        res.status(404).json({
          error: 'User not in group',
          message: 'User is not a member of this group',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (result === UNAUTHORIZED) {
        res.status(403).json({
          error: 'Forbidden',
          message:
            'You can only leave a group yourself or remove others if you are the group creator',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      res.status(204).send();
    } catch (error) {
      console.error('Error removing user from group:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to remove user from group',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

router.get(
  '/groups/:groupId/membershipEvents',
  async (req: express.Request, res: express.Response): Promise<void> => {
    try {
      const { groupId } = req.params;
      const { since } = req.query;
      const currentUserId = getUserId(req);

      if (!groupId) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'groupId is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (!since) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'since query parameter is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      console.log(
        `Fetching membership events for group: ${groupId} since: ${since}`
      );
      const result = await groupService.getMembershipEvents(
        currentUserId,
        groupId,
        since as string
      );

      if (result === GROUP_NOT_FOUND) {
        res.status(404).json({
          error: 'Group not found',
          message: 'Group not found or has been deleted',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (result === UNAUTHORIZED) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'You are not a member of this group',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      res.json({
        events: result,
        syncTimestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error fetching membership events:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to fetch membership events',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

const handleResult = <Result>(
  res: express.Response,
  result: Result | typeof UNAUTHORIZED | typeof GROUP_NOT_FOUND,
  status: number = 200
) => {
  if (result === UNAUTHORIZED) {
    res.status(403).json({
      error: 'Forbidden',
      message: 'You are not authorized to perform this action',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (result === GROUP_NOT_FOUND) {
    res.status(404).json({
      error: 'Group not found',
      message: 'Group not found or has been deleted',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  res.status(status).json(result);
};

const getUserId = (req: express.Request): string =>
  (req.headers['x-user-id'] as string) ||
  '11111111-1111-1111-1111-111111111111';

export default router;

