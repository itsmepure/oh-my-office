// NextAuth v5 catch-all route handler.
// Mounts NextAuth's REST endpoints at /api/auth/* (signin, callback, session, csrf, etc.)
// Docs: https://authjs.dev/getting-started/installation#3.-setup

import { handlers } from '@/auth';

export const { GET, POST } = handlers;
