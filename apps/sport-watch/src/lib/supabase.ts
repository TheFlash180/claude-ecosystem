import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  'https://objkdeagyltvgcuxsnxu.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9iamtkZWFneWx0dmdjdXhzbnh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxMDg3OTksImV4cCI6MjA5ODY4NDc5OX0.Rrej_NswjMu7HzfX3puCVybeOx2JGkbSYcHNx5s19Pc',
);
