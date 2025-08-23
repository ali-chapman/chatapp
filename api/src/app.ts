import * as OpenApiValidator from 'express-openapi-validator';
import express from 'express';
import userRoutes from './users/controller';
import groupRoutes from './groups/controller';
import messageRoutes from './messages/controller';
import syncRoutes from './sync/controller';
import adminRoutes from './admin/controller';
import conflictRoutes from './conflict/controller';

const app = express();

app.use(express.json());
app.use(
  OpenApiValidator.middleware({
    apiSpec: './src/openapi.yml',
    validateRequests: true,
    validateResponses: true,
  })
);

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
