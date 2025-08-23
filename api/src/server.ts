import app from './app';
import pool from './db';

const PORT = process.env['PORT'] || 3000;

// Test database connection
pool
  .connect()
  .then((client) => {
    console.log('Database connected successfully');
    client.release();

    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Database connection failed:', err);
    process.exit(1);
  });

