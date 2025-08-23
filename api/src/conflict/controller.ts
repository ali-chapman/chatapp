import express from 'express';
import { ConflictService } from './service';

const router = express.Router();
const conflictService = new ConflictService();

router.get(
  '/conflict/policies',
  async (_req: express.Request, res: express.Response): Promise<void> => {
    try {
      console.log('Fetching all conflict policies');
      const policies = await conflictService.getAllPolicies();
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

router.get(
  '/conflict/policies/entity/:entityType',
  async (req: express.Request, res: express.Response): Promise<void> => {
    try {
      const { entityType } = req.params;

      if (!entityType) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'entityType is required',
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

      console.log(`Fetching conflict policies for entity type: ${entityType}`);
      const policies = await conflictService.getPoliciesByEntityType(entityType);
      res.json({ policies });
    } catch (error) {
      console.error('Error fetching conflict policies by entity type:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to fetch conflict policies',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

router.get(
  '/conflict/policies/entity/:entityType/conflict/:conflictType',
  async (req: express.Request, res: express.Response): Promise<void> => {
    try {
      const { entityType, conflictType } = req.params;

      if (!entityType) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'entityType is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (!conflictType) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'conflictType is required',
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

      console.log(
        `Fetching conflict policy for entity: ${entityType}, conflict: ${conflictType}`
      );
      const policy = await conflictService.getPolicyByConflictType(
        entityType,
        conflictType
      );

      if (!policy) {
        res.status(404).json({
          error: 'Policy not found',
          message: 'No active policy found for this entity and conflict type',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      res.json(policy);
    } catch (error) {
      console.error('Error fetching conflict policy:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to fetch conflict policy',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

router.get(
  '/conflict/resolutions',
  async (_req: express.Request, res: express.Response): Promise<void> => {
    try {
      console.log('Fetching all conflict resolutions');
      const resolutions = await conflictService.getAllResolutions();
      res.json({ resolutions });
    } catch (error) {
      console.error('Error fetching conflict resolutions:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to fetch conflict resolutions',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

export default router;