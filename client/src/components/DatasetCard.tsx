import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { api, ApiError } from '../api';
import type { Dataset } from '../types';

type Props = {
  dataset: Dataset;
  onDeleted: (id: number) => void;
  onUploaded: (id: number, inserted: number) => void;
};

type Message = { kind: 'ok' | 'error'; text: string };

export function DatasetCard({ dataset, onDeleted, onUploaded }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // lets the user pick the same file again later
    if (!file) return;

    setBusy(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.append('file', file); // the field name must match upload.single('file') on the server
      const result = await api<{ inserted: number; skipped: number }>(
        `/api/datasets/${dataset.id}/samples`,
        { method: 'POST', body: form }
      );
      onUploaded(dataset.id, result.inserted);
      setMessage({
        kind: 'ok',
        text: `Added ${result.inserted} samples (${result.skipped} skipped).`,
      });
    } catch (err) {
      setMessage({
        kind: 'error',
        text: err instanceof ApiError ? err.message : 'Could not reach the server',
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete "${dataset.name}" with all its samples and annotations?`)) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await api(`/api/datasets/${dataset.id}`, { method: 'DELETE' });
      onDeleted(dataset.id); // the parent removes this card, so there is nothing to reset here
    } catch (err) {
      setMessage({
        kind: 'error',
        text: err instanceof ApiError ? err.message : 'Could not reach the server',
      });
      setBusy(false);
    }
  }

  return (
    <article className="card">
      <h3>{dataset.name}</h3>

      <ul className="chips" aria-label="Labels">
        {dataset.labels.map((label) => (
          <li key={label} className="chip">
            {label}
          </li>
        ))}
      </ul>

      {dataset.sample_count > 0 ? (
        <>
          <progress max={dataset.sample_count} value={dataset.annotated_count} />
          <p className="muted">
            {dataset.annotated_count} / {dataset.sample_count} annotated
          </p>
        </>
      ) : (
        <p className="muted">No samples yet. Upload a CSV with a "text" column.</p>
      )}

      {message && (
        <p className={message.kind === 'ok' ? 'success' : 'error'} role="status">
          {message.text}
        </p>
      )}

      <div className="card-actions">
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => fileInput.current?.click()}
        >
          {busy ? 'Working...' : 'Upload CSV'}
        </button>
        <button type="button" className="danger" disabled={busy} onClick={handleDelete}>
          Delete
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={handleFile}
        />
      </div>
    </article>
  );
}