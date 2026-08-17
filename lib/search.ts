// Shared types for the search corpus — kept here so both the API route
// and the client search page can import them without pulling in server modules.

export interface CorpusPost {
  slug: string;
  postId: string;
  sessionLabel: string;
  sessionDate: string; // startedAt of the archive entry (for grouping/display)
  indexedAt: string;   // timestamp of the individual post
  text: string;
  imageUrl?: string;   // thumb of the post's first image, if it has one
  imageCount?: number; // total images attached to the post
}
