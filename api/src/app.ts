import * as OpenApiValidator from 'express-openapi-validator';
import express from 'express';
import cors from 'cors';
import userRoutes from './users/controller';
import { UserService, USER_NOT_FOUND } from './users/service';
import groupRoutes from './groups/controller';
import messageRoutes from './messages/controller';
import syncRoutes from './sync/controller';
import adminRoutes from './admin/controller';
import conflictRoutes from './conflict/controller';
import path from 'path';

const app = express();

app.use(cors());
app.use(express.json());
app.use(
  OpenApiValidator.middleware({
    apiSpec: path.join(__dirname, 'openapi.yml'),
    validateRequests: true,
    validateResponses: true,
  })
);

// Unauthenticated routes
app.get(
  '/users/by-username/:username',
  async (req: express.Request, res: express.Response) => {
    try {
      const { username } = req.params;

      if (!username) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Username parameter is required',
          timestamp: new Date().toISOString(),
        });
      }

      console.log('Fetching user by username:', username);

      const userService = new UserService();
      const result = await userService.getUserByUsername(username);

      if (result === USER_NOT_FOUND) {
        return res.status(404).json({
          error: 'User not found',
          message: `User with username '${username}' not found`,
          timestamp: new Date().toISOString(),
        });
      }

      return res.json(result);
    } catch (error) {
      console.error('Error fetching user by username:', error);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to fetch user',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// Authentication middleware for protected routes
app.use((req, res, next) => {
  const currentUserId = req.header('x-user-id') as string;
  if (!currentUserId) {
    res.status(401).json({ message: 'Unauthorized: Missing x-user-id header' });
  } else {
    next();
  }
});

app.use('/', userRoutes);
app.use('/', groupRoutes);
app.use('/', messageRoutes);
app.use('/', syncRoutes);
app.use('/', adminRoutes);
app.use('/', conflictRoutes);

app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error('Express error handler caught:', err);
    const error = err as any;
    // format error
    res.status(error?.status || 500).json({
      message: error?.message || 'Internal Server Error',
    });
  }
);

export default app;
