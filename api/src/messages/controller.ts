import express from 'express';
import { MessageService } from './service';

const router = express.Router();

const messageService = new MessageService();

// GET /groups/{groupId}/messages - Get messages for a specific group
router.get(
  '/groups/:groupId/messages',
  async (req: express.Request, res: express.Response): Promise<void> => {
    try {
      const { groupId } = req.params;
      const { limit = '50', since } = req.query;
      const currentUserId = getUserId(req);

      if (!groupId) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'groupId is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      console.log(`Fetching messages for group: ${groupId}`);
      const result = await messageService.getMessagesForGroup(
        currentUserId,
        groupId,
        since as string | undefined,
        parseInt(limit as string)
      );

      handleResult(res, result);
    } catch (error) {
      console.error('Error fetching messages:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to fetch messages',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// POST /groups/{groupId}/messages - Create a new message
router.post(
  '/groups/:groupId/messages',
  async (req: express.Request, res: express.Response): Promise<void> => {
    try {
      const { groupId } = req.params;
      const { content, localId } = req.body;
      const currentUserId = getUserId(req);

      if (!content) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'content is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (typeof content !== 'string' || content.trim().length === 0) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Content must be a non-empty string',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const result = await messageService.createMessage(
        currentUserId,
        groupId as string,
        content,
        localId
      );
      handleResult(res, result, 201);
    } catch (error) {
      console.error('Error creating message:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to create message',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

const handleResult = <Result>(
  res: express.Response,
  result: Result | 'UNAUTHORIZED' | 'GROUP_NOT_FOUND',
  status: number = 200
) => {
  if (result === 'UNAUTHORIZED') {
    res.status(403).json({
      error: 'Forbidden',
      message: 'You are not authorized to perform this action',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (result === 'GROUP_NOT_FOUND') {
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
  req.headers['x-user-id'] as string;

export default router;
