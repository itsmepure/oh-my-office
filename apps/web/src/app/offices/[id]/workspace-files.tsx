'use client';

import { useEffect, useState, useCallback } from 'react';

interface WorkspaceFile {
  relPath: string;
  size: number;
  modifiedAt: string;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function WorkspaceFiles({ officeId }: { officeId: string }) {
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/offices/${officeId}/files`, { cache: 'no-store' });
      if (res.ok) setFiles((await res.json()) as WorkspaceFile[]);
    } finally {
      setLoading(false);
    }
  }, [officeId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading) {
    return <p className="text-sm text-content-muted">Loading files…</p>;
  }

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="text-sm text-content-muted">
          No files yet. When agents write files, they appear here for download.
        </p>
        <button
          type="button"
          onClick={() => void refresh()}
          className="cursor-pointer border border-line px-2.5 py-1 text-xs text-content-muted transition hover:border-accent/50 hover:text-content"
        >
          Refresh
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-content-muted">{files.length} files</p>
        <span className="flex gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            className="cursor-pointer border border-line px-2.5 py-1 text-xs text-content-muted transition hover:border-accent/50 hover:text-content"
          >
            Refresh
          </button>
          <a
            href={`/api/offices/${officeId}/files/zip`}
            className="cursor-pointer bg-accent px-2.5 py-1 text-xs font-medium text-bg transition hover:bg-accent-bright"
          >
            Download all (.zip)
          </a>
        </span>
      </div>
      <ul className="divide-y divide-line border border-line">
        {files.map((f) => (
          <li key={f.relPath} className="flex items-center justify-between bg-surface px-3 py-2 text-sm">
            <span className="min-w-0 truncate">
              <span className="font-mono text-content">{f.relPath}</span>
              <span className="ml-2 font-mono text-[10px] text-content-faint">{fmtSize(f.size)}</span>
            </span>
            <a
              href={`/api/offices/${officeId}/files/download?path=${encodeURIComponent(f.relPath)}`}
              className="shrink-0 cursor-pointer border border-line px-2 py-0.5 text-xs text-content-muted transition hover:border-accent/50 hover:text-content"
            >
              Download
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
