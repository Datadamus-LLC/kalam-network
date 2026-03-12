import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config({ path: '../../.env' });

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'hedera_social',
  password: process.env.DB_PASSWORD || 'devpassword',
  database: process.env.DB_DATABASE || 'hedera_social',
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
  entities: ['src/database/entities/**/*.ts'],
  migrations: ['src/database/migrations/**/*.ts'],
  subscribers: [],
});
