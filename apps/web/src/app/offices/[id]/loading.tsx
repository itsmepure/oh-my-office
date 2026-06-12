// Route-level loading skeleton for the office detail page (Phase 9).
// Shown while the server component fetches office + tasks.

export default function OfficeLoading() {
  return (
    <main className="min-h-screen bg-bg p-4 sm:p-8">
      <div className="mx-auto max-w-4xl animate-pulse space-y-6">
        <div className="space-y-2">
          <div className="h-4 w-24 rounded-md bg-surface-2" />
          <div className="h-8 w-2/3 rounded-md bg-surface-2" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="h-20 rounded-xl border border-line bg-surface" />
          <div className="h-20 rounded-xl border border-line bg-surface" />
        </div>
        <div className="h-64 rounded-xl border border-line bg-surface" />
        <div className="h-40 rounded-xl border border-line bg-surface" />
      </div>
    </main>
  );
}
