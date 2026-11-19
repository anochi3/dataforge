import { useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import { useAuth } from '../auth/context';
import { CreateDatasetForm } from '../components/CreateDatasetForm';
import { DatasetCard } from '../components/DatasetCard';
import type { Dataset } from '../types';

export function DashboardPage() {
  const { user, logout } = useAuth();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    api<Dataset[]>('/api/datasets')
      .then((data) => {
        if (!cancelled) setDatasets(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof ApiError ? err.message : 'Could not reach the server');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function handleCreated(dataset: Dataset) {
    setDatasets((prev) => [dataset, ...prev]);
  }

  function handleDeleted(id: number) {
    setDatasets((prev) => prev.filter((d) => d.id !== id));
  }

  function handleUploaded(id: number, inserted: number) {
    setDatasets((prev) =>
      prev.map((d) => (d.id === id ? { ...d, sample_count: d.sample_count + inserted } : d))
    );
  }

  return (
    <main className="container">
      <header className="topbar">
        <h1>DataForge</h1>
        <div className="topbar-right">
          <span>{user?.email}</span>
          <button className="secondary" onClick={logout}>
            Log out
          </button>
        </div>
      </header>

      <section className="panel">
        <h2>New dataset</h2>
        <CreateDatasetForm onCreated={handleCreated} />
      </section>

      <section>
        <h2>Your datasets</h2>

        {loading && <p className="muted">Loading datasets...</p>}
        {loadError && (
          <p className="error" role="alert">
            {loadError}
          </p>
        )}
        {!loading && !loadError && datasets.length === 0 && (
          <p className="muted">No datasets yet. Create your first one above.</p>
        )}

        <div className="dataset-grid">
          {datasets.map((dataset) => (
            <DatasetCard
              key={dataset.id}
              dataset={dataset}
              onDeleted={handleDeleted}
              onUploaded={handleUploaded}
            />
          ))}
        </div>
      </section>
    </main>
  );
}