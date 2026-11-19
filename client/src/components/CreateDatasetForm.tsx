import { useState } from 'react';
import type { FormEvent } from 'react';
import { api, ApiError } from '../api';
import type { Dataset } from '../types';

type Props = { onCreated: (dataset: Dataset) => void };

type CreatedDataset = Omit<Dataset, 'sample_count' | 'annotated_count'>;

export function CreateDatasetForm({ onCreated }: Props) {
  const [name, setName] = useState('');
  const [labels, setLabels] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const parsedLabels = labels
      .split(',')
      .map((l) => l.trim())
      .filter((l) => l !== '');

    if (parsedLabels.length === 1) {
      setError('Enter at least 2 labels, or leave the field empty for the defaults.');
      return;
    }

    setSubmitting(true);
    try {
      // Omit "labels" when empty so the server applies its default labels.
      const created = await api<CreatedDataset>('/api/datasets', {
        method: 'POST',
        body: parsedLabels.length > 0 ? { name, labels: parsedLabels } : { name },
      });
      onCreated({ ...created, sample_count: 0, annotated_count: 0 });
      setName('');
      setLabels('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="inline-form" onSubmit={handleSubmit}>
      <label>
        Dataset name
        <input value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <label>
        Labels (comma separated, optional)
        <input
          value={labels}
          onChange={(e) => setLabels(e.target.value)}
          placeholder="Reliable, Misleading, False"
        />
      </label>
      <button type="submit" disabled={submitting}>
        {submitting ? 'Creating...' : 'Create'}
      </button>
      {error && (
        <p className="error full-row" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}