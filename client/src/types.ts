export type Dataset = {
  id: number;
  name: string;
  labels: string[];
  created_at: string;
  sample_count: number;
  annotated_count: number;
};

export type DatasetDetail = {
  id: number;
  name: string;
  labels: string[];
  created_at: string;
};

export type Sample = { id: number; text: string };

export type Stats = {
  total: number;
  annotated: number;
  remaining: number;
  labelCounts: Record<string, number>;
};