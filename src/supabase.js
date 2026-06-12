import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://vkacglvyakqayuvdspmq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZrYWNnbHZ5YWtxYXl1dmRzcG1xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMzM1MTMsImV4cCI6MjA5NjYwOTUxM30.N-lUC8Y1hdz9_fBNzvprrqWzwVoKRCEdRWTzJi1ZNFM';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
