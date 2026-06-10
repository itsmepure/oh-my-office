import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@repo/shared', '@repo/db', 'next-auth'],
  // Several deps are server-only — webpack should not try to bundle them for
  // the client. bcryptjs is server-side only; next-auth's main export
  // references server code that leaks node: schemes.
  // @repo/db is in transpilePackages (not serverExternalPackages) so Next
  // can transform its ESM → CommonJS for the server bundle.
  serverExternalPackages: [
    '@prisma/client',
    '@prisma/adapter-pg',
    'pg',
    'bcryptjs',
    '@auth/core',
  ],
  webpack(config, { isServer, nextRuntime }) {
    if (!isServer || nextRuntime === 'edge') {
      // The vitest config is not part of the app — tell webpack to ignore it
      // so it doesn't try to resolve `node:path` for the test config file.
      config.module.rules.push({
        test: /vitest\.config\.ts$/,
        loader: 'ignore-loader',
      });
    }

    // For any target that shouldn't bundle Node built-ins (browser, edge),
    // make `node:*` schemes a no-op external. This prevents webpack from
    // choking on Prisma 7's `import * as path from 'node:path'` statements
    // when it tries to trace the import graph for the RSC client manifest.
    if (!isServer || nextRuntime === 'edge') {
      config.resolve = config.resolve ?? {};
      config.resolve.fallback = {
        ...(config.resolve.fallback ?? {}),
        path: false,
        fs: false,
        crypto: false,
        os: false,
        stream: false,
        util: false,
      };
    }
    return config;
  },
};

export default nextConfig;


