import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Add these to your .env
// SUPABASE_URL=https://xxxxx.supabase.co
// SUPABASE_SERVICE_ROLE_KEY=your-secret-service-role-key
