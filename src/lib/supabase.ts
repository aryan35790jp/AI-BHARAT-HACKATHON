import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase environment variables not set. Auth will not work.\n' +
    'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env'
  );
}

export const supabase = createClient(
  supabaseUrl || 'https://sfwayrifcqzswtyusjrs.supabase.co',
  supabaseAnonKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmd2F5cmlmY3F6c3d0eXVzanJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4OTE4MjEsImV4cCI6MjA4ODQ2NzgyMX0.Uc-bTOjOAA7iFf0QKZWffBQ4YuhoZPeK3LFP8608W1U',
);
