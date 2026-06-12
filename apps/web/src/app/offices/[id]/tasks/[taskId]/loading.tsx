// Route-level loading skeleton for the task detail page (Phase 9).

export default function TaskLoading() {
  return (
    <main className="min-h-screen bg-bg p-4 sm:p-8">
      <div className="mx-auto max-w-4xl animate-pulse space-y-6">
        <div className="space-y-2">
          <div className="h-4 w-32 rounded-md bg-surface-2" />
          <div className="h-8 w-1/2 rounded-md bg-surface-2" />
        </div>
        <div className="h-28 rounded-xl border border-line bg-surface" />
        <div className="h-48 rounded-xl border border-line bg-surface" />
        <div className="h-48 rounded-xl border border-line bg-surface" />
      </div>
    </main>
  );
}
