import express from 'express';
import {
  UserService,
  USER_NOT_FOUND,
  USER_ALREADY_EXISTS,
  INVALID_CREDENTIALS,
} from './service';

const router = express.Router();
const userService = new UserService();

router.get('/users', async (_req: express.Request, res: express.Response) => {
  try {
    console.log('Fetching all users');
    const users = await userService.getAllUsers();
    res.json({ users });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch users',
      timestamp: new Date().toISOString(),
    });
  }
});

router.get(
  '/users/me',
  async (req: express.Request, res: express.Response) => {
    try {
      console.log('Fetching current user');
      const currentUserId = getUserId(req);

      const result = await userService.getCurrentUser(currentUserId);

      if (result === USER_NOT_FOUND) {
        return res.status(404).json({
          error: 'User not found',
          message: 'Current user not found',
          timestamp: new Date().toISOString(),
        });
      }

      return res.json(result);
    } catch (error) {
      console.error('Error fetching current user:', error);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to fetch current user',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

router.post(
  '/auth/register',
  async (req: express.Request, res: express.Response): Promise<void> => {
    try {
      const { username, displayName, email, password } = req.body;

      if (!username || !displayName || !email || !password) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'username, displayName, email, and password are required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (
        typeof username !== 'string' ||
        username.length < 3 ||
        username.length > 50
      ) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Username must be between 3 and 50 characters',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (typeof password !== 'string' || password.length < 8) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Password must be at least 8 characters long',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      console.log('Creating new user account');

      const result = await userService.registerUser({
        username,
        displayName,
        email,
        password,
      });

      if (result === USER_ALREADY_EXISTS) {
        res.status(409).json({
          error: 'Conflict',
          message: 'Username or email already exists',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      res.status(201).json(result);
    } catch (error) {
      console.error('Error creating user account:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to create user account',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

router.post(
  '/auth/login',
  async (req: express.Request, res: express.Response): Promise<void> => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'username and password are required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      console.log(`User ${username} attempting login`);

      const result = await userService.loginUser({ username, password });

      if (result === INVALID_CREDENTIALS) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid username or password',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      res.json(result);
    } catch (error) {
      console.error('Error during login:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to login',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

const getUserId = (req: express.Request): string =>
  (req.headers['x-user-id'] as string) ||
  '11111111-1111-1111-1111-111111111111';

export default router;