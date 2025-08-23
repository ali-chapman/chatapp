import dotenv from 'dotenv';

dotenv.config();

interface Config {
  port: number;
  nodeEnv: string;
  database: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  };
}

export const config: Config = {
  port: Number(process.env['PORT']) || 3000,
  nodeEnv: process.env['NODE_ENV'] || 'development',
  database: {
    host: process.env['DB_HOST'] || 'localhost',
    port: Number(process.env['DB_PORT']) || 5433,
    database: process.env['DB_NAME'] || 'chatapp',
    user: process.env['DB_USER'] || 'chatapp',
    password: process.env['DB_PASSWORD'] || 'chatapp_password',
  },
};
