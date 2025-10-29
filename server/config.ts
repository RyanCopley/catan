import dotenv from 'dotenv';

// Load environment variables FIRST, before any other imports
// Load .env first
dotenv.config();

// Then load .env.local to override for local development (if it exists)
dotenv.config({ path: '.env.local', override: true });

// Export so other modules can import this to ensure env is loaded
export const envLoaded = true;
