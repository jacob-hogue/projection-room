/** The pieces in the Room: one entry each, read by the gallery and by every piece page. */

export type Category = 'visualization' | 'architecture' | 'analysis' | 'engineering';

export interface CategoryInfo {
  label: string;
  /** Tag color on the dark ground. */
  color: string;
}

export const CATEGORIES: Record<Category, CategoryInfo> = {
  visualization: { label: 'Data visualization', color: '#4ade80' },
  architecture: { label: 'Solution architecture', color: '#38bdf8' },
  analysis: { label: 'Spatial analysis', color: '#f59e0b' },
  engineering: { label: 'Engineering', color: '#a78bfa' },
};

export interface Piece {
  slug: string;
  title: string;
  rule: string;
  date: string;
  category: Category;
  /** What a reader can take as shown: the skills and tools, three to five of them. */
  demonstrates: string[];
  /** Film length, as shown. */
  runtime: string;
}

export const PIECES: Piece[] = [
  {
    slug: 'parcel-problem',
    title: 'The Parcel Problem',
    rule: 'A county keeps five copies of its parcel map, and they disagree. One database of record and a nightly job that sends only what changed put every office back on the same map.',
    date: 'November 2026',
    category: 'architecture',
    demonstrates: ['system design', 'ArcGIS Enterprise and Online', 'change-based publishing', 'GeoParquet and PMTiles'],
    runtime: '6:46',
  },
  {
    slug: 'spatial-join',
    title: 'The spatial join',
    rule: 'A million Uber pickups, 263 New York taxi zones, and the question of which zone each pickup was in. Six ways to answer it, compared fairly.',
    date: 'November 2026',
    category: 'engineering',
    demonstrates: ['spatial indexing', 'fair benchmarking', 'R-tree, Geohash, S2, H3 and A5', 'Python'],
    runtime: '7:06',
  },
  {
    slug: 'dial-pulse',
    title: 'The dial-pulse map',
    rule: 'In 1947 the biggest cities got the area codes that were fastest to dial. Every territory is colored by how many clicks it took.',
    date: 'November 2026',
    category: 'visualization',
    demonstrates: ['cartography', 'animated data storytelling', 'Python geodata pipelines'],
    runtime: '4:56',
  },
];

/** Filter chips appear once the gallery is big enough to need them. */
export const SHOW_FILTERS = PIECES.length >= 4;

export const pieceBySlug = (slug: string): Piece | undefined => PIECES.find((p) => p.slug === slug);
