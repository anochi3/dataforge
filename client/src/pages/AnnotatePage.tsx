import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import type { DatasetDetail, Sample, Stats } from '../types';

type NextResponse = { sample: Sample | null };

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Could not reach the server';
}

export function AnnotatePage() {
  const { id } = useParams();
  const datasetId = Number(id);
  const validId = Number.isInteger(datasetId) && datasetId > 0;

  const [dataset, setDataset] = useState<DatasetDetail | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [sample, setSample] = useState<Sample | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Initial load: the dataset, the progress numbers and the first unlabelled sample, in parallel.
  useEffect(() => {
    if (!validId) return;
    let cancelled = false;

    Promise.all([
      api<DatasetDetail>(`/api/datasets/${datasetId}`),
      api<Stats>(`/api/datasets/${datasetId}/stats`),
      api<NextResponse>(`/api/datasets/${datasetId}/samples/next`),
    ])
      .then(([d, s, n]) => {
        if (cancelled) return;
        setDataset(d);
        setStats(s);
        setSample(n.sample);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [datasetId, validId]);

  const saveLabel = useCallback(
    async (label: string) => {
      if (!sample || saving) return;
      setSaving(true);
      setSaveError(null);
      try {
        await api(`/api/datasets/${datasetId}/samples/${sample.id}/annotation`, {
          method: 'PUT',
          body: { label },
        });
        // Re-read progress and the next sample from the server, so the screen always matches the database.
        const [s, n] = await Promise.all([
          api<Stats>(`/api/datasets/${datasetId}/stats`),
          api<NextResponse>(`/api/datasets/${datasetId}/samples/next`),
        ]);
        setStats(s);
        setSample(n.sample);
      } catch (err) {
        setSaveError(errorMessage(err));
      } finally {
        setSaving(false);
      }
    },
    [datasetId, sample, saving]
  );

  // Keyboard shortcuts: keys 1-9 choose the label at that position.
  useEffect(() => {
    if (!dataset || !sample) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= dataset!.labels.length) {
        saveLabel(dataset!.labels[n - 1]);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dataset, sample, saveLabel]);

  if (!validId) {
    return (
      <main className="container">
        <p className="error" role="alert">
          Invalid dataset id.
        </p>
        <Link to="/">Back to datasets</Link>
      </main>
    );
  }

  if (loading) {
    return <p className="center-note">Loading...</p>;
  }

  if (loadError || !dataset || !stats) {
    return (
      <main className="container">
        <p className="error" role="alert">
          {loadError ?? 'Something went wrong'}
        </p>
        <Link to="/">Back to datasets</Link>
      </main>
    );
  }

  const percent = stats.total > 0 ? Math.round((stats.annotated / stats.total) * 100) : 0;

  return (
    <main className="container">
      <header className="topbar">
        <div>
          <Link to="/" className="back-link">
            ← All datasets
          </Link>
          <h1>{dataset.name}</h1>
        </div>
        <span className="muted">
          {stats.annotated} / {stats.total} annotated ({percent}%)
        </span>
      </header>

      <progress className="wide-progress" max={Math.max(stats.total, 1)} value={stats.annotated} />

      <div className="annotate-layout">
        <section className="panel">
          {stats.total === 0 ? (
            <>
              <h2>No samples</h2>
              <p className="muted">Upload a CSV from the dashboard to start annotating.</p>
            </>
          ) : sample === null ? (
            <>
              <h2>All done</h2>
              <p className="muted">You have annotated all {stats.total} samples in this dataset.</p>
              <Link to="/" className="button-link">
                Back to datasets
              </Link>
            </>
          ) : (
            <>
              <p className="sample-text" aria-live="polite">
                {sample.text}
              </p>

              <div className="label-buttons">
                {dataset.labels.map((label, index) => (
                  <button
                    key={label}
                    type="button"
                    disabled={saving}
                    onClick={() => saveLabel(label)}
                  >
                    {index < 9 && <kbd>{index + 1}</kbd>}
                    {label}
                  </button>
                ))}
              </div>

              {saveError && (
                <p className="error" role="alert">
                  {saveError}
                </p>
              )}
            </>
          )}
        </section>

        <aside className="panel">
          <h2>Label distribution</h2>
          <ul className="distribution">
            {dataset.labels.map((label) => {
              const count = stats.labelCounts[label] ?? 0;
              const width = stats.annotated > 0 ? (count / stats.annotated) * 100 : 0;
              return (
                <li key={label}>
                  <div className="distribution-row">
                    <span>{label}</span>
                    <span className="muted">{count}</span>
                  </div>
                  <div className="bar">
                    <div className="bar-fill" style={{ width: `${width}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>
    </main>
  );
}