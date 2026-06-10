import { SHARED_PACKAGE_VERSION } from '@repo/shared';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-bold">Multi-Office AI Platform</h1>
      <p className="text-content-muted">
        Scaffold online. Shared contracts v{SHARED_PACKAGE_VERSION}.
      </p>
    </main>
  );
}
