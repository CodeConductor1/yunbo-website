// Must come before the supabase client is created: the JS client relies on
// URL/URLSearchParams, which React Native does not fully implement.
import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  console.warn(
    'Supabase is not configured. Copy .env.example to .env and restart with `npx expo start -c`.',
  );
}

export const supabase = createClient(
  supabaseUrl ?? 'https://placeholder.supabase.co',
  supabaseAnonKey ?? 'placeholder-anon-key',
  {
    auth: { persistSession: false },
    realtime: { params: { eventsPerSecond: 5 } },
  },
);

/** Row shape of `public.rider_positions`. */
export type RiderPositionRow = {
  rider_id: string;
  route_id: string;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  speed_mps: number | null;
  updated_at: string;
};
