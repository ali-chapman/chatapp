import express from 'express';
import { AdminService, POLICY_NOT_FOUND } from './service';
import { CreateConflictPolicyRequest } from './admin';

const router = express.Router();
const adminService = new AdminService();

const requireAdmin = async (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): Promise<void> => {
  const currentUserId = getUserId(req);

  try {
    const isAdmin = await adminService.checkAdminStatus(currentUserId);

    if (!isAdmin) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Admin access required',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    next();
  } catch (error) {
    console.error('Error checking admin status:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to verify admin status',
      timestamp: new Date().toISOString(),
    });
  }
};

router.get(
  '/admin/conflictPolicies',
  requireAdmin,
  async (_req: express.Request, res: express.Response): Promise<void> => {
    try {
      console.log('Fetching all conflict resolution policies');

      const policies = await adminService.getAllConflictPolicies();
      res.json({ policies });
    } catch (error) {
      console.error('Error fetching conflict policies:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to fetch conflict policies',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

router.post(
  '/admin/conflictPolicies',
  requireAdmin,
  async (req: express.Request, res: express.Response): Promise<void> => {
    try {
      const request: CreateConflictPolicyRequest = req.body;
      const currentUserId = getUserId(req);

      const { policyName, entityType, conflictType, resolutionStrategy } =
        request;

      if (!policyName || !entityType || !conflictType || !resolutionStrategy) {
        res.status(400).json({
          error: 'Bad Request',
          message:
            'policyName, entityType, conflictType, and resolutionStrategy are required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (!['MESSAGE', 'MEMBERSHIP', 'GROUP'].includes(entityType)) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'entityType must be one of: MESSAGE, MEMBERSHIP, GROUP',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      console.log('Creating/updating conflict resolution policy');

      const policy = await adminService.createOrUpdateConflictPolicy(
        currentUserId,
        request
      );

      res.status(201).json(policy);
    } catch (error) {
      console.error('Error creating/updating conflict policy:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to create/update conflict policy',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

router.delete(
  '/admin/conflictPolicies/:policyId',
  requireAdmin,
  async (req: express.Request, res: express.Response): Promise<void> => {
    try {
      const { policyId } = req.params;

      if (!policyId) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'policyId is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      console.log(`Deleting conflict policy with id: ${policyId}`);

      const result = await adminService.deleteConflictPolicy(policyId);

      if (result === POLICY_NOT_FOUND) {
        res.status(404).json({
          error: 'Policy not found',
          message: 'Conflict resolution policy not found',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      res.status(204).send();
    } catch (error) {
      console.error('Error deleting conflict policy:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to delete conflict policy',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

const getUserId = (req: express.Request): string =>
  (req.headers['x-user-id'] as string) ||
  '11111111-1111-1111-1111-111111111111';

export default router;

