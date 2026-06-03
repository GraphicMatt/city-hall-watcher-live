/**
 * One-time preprocessing script: reads the raw tweets.js archive (~104MB),
 * filters to Matt's own tweets and self-replies, strips to minimal fields,
 * and writes data/council-tweets.json (~8MB) for use by the import pipeline.
 *
 * Run once locally: npx ts-node --project tsconfig.json scripts/preprocess-tweets.ts
 *
 * The raw bluesky-twitter-archive/ directory is gitignored.
 * The output data/council-tweets.json is committed to the repo.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const MATT_USER_ID = '1956441';

interface RawTweetMedia {
  type: string;
  media_url_https: string;
}

interface RawTweetUrl {
  url: string;
  expanded_url: string;
}

interface RawTweetRecord {
  id_str: string;
  created_at: string;
  full_text: string;
  in_reply_to_status_id_str?: string;
  in_reply_to_user_id_str?: string;
  favorite_count: string;
  retweet_count: string;
  entities?: {
    urls?: RawTweetUrl[];
  };
  extended_entities?: {
    media?: RawTweetMedia[];
  };
}

export interface ProcessedTweet {
  id_str: string;
  created_at: string;
  full_text: string;
  in_reply_to_status_id_str?: string;
  in_reply_to_user_id_str?: string;
  favorite_count: string;
  retweet_count: string;
  urls?: { url: string; expanded_url: string }[];
  media_urls?: string[];
}

function findTweetsFiles(): string[] {
  const archiveDir = join(process.cwd(), 'bluesky-twitter-archive');
  if (!existsSync(archiveDir)) {
    throw new Error(`Archive directory not found: ${archiveDir}`);
  }

  // Find all tweets*.js files anywhere under bluesky-twitter-archive/data/
  const entries = readdirRecursive(archiveDir);
  const files = entries.filter(f => /\/data\/tweets(-part\d+)?\.js$/.test(f)).sort();
  if (files.length === 0) {
    throw new Error('Could not find tweets.js under bluesky-twitter-archive/');
  }
  return files;
}

function readdirRecursive(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...readdirRecursive(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

function parseTweetsJs(filePath: string): RawTweetRecord[] {
  console.log(`Reading ${filePath} ...`);
  const raw = readFileSync(filePath, 'utf-8');

  // Strip "window.YTD.tweets.partN = " prefix and trailing semicolon
  const jsonStr = raw.replace(/^window\.YTD\.tweets\.\w+\s*=\s*/, '').replace(/;?\s*$/, '');
  const data = JSON.parse(jsonStr) as Array<{ tweet: RawTweetRecord }>;
  return data.map(d => d.tweet);
}

function isKeptTweet(tweet: RawTweetRecord): boolean {
  // Skip retweets
  if (tweet.full_text.startsWith('RT @')) return false;

  // Keep original tweets (no in_reply_to_user_id_str) and self-replies
  const replyTo = tweet.in_reply_to_user_id_str;
  if (replyTo && replyTo !== MATT_USER_ID) return false;

  return true;
}

function stripTweet(tweet: RawTweetRecord): ProcessedTweet {
  const result: ProcessedTweet = {
    id_str: tweet.id_str,
    created_at: tweet.created_at,
    full_text: tweet.full_text,
    favorite_count: tweet.favorite_count,
    retweet_count: tweet.retweet_count,
  };

  if (tweet.in_reply_to_status_id_str) {
    result.in_reply_to_status_id_str = tweet.in_reply_to_status_id_str;
  }
  if (tweet.in_reply_to_user_id_str) {
    result.in_reply_to_user_id_str = tweet.in_reply_to_user_id_str;
  }

  const urls = tweet.entities?.urls?.filter(u => u.expanded_url && !u.expanded_url.startsWith('https://twitter.com/i/web/status'));
  if (urls && urls.length > 0) {
    result.urls = urls.map(u => ({ url: u.url, expanded_url: u.expanded_url }));
  }

  const photos = tweet.extended_entities?.media?.filter(m => m.type === 'photo');
  if (photos && photos.length > 0) {
    result.media_urls = photos.map(m => m.media_url_https);
  }

  return result;
}

async function main() {
  const tweetsFiles = findTweetsFiles();
  const allTweets: RawTweetRecord[] = [];
  for (const f of tweetsFiles) {
    allTweets.push(...parseTweetsJs(f));
  }
  console.log(`Total tweets in archive: ${allTweets.length} (from ${tweetsFiles.length} file(s))`);

  const filtered = allTweets.filter(isKeptTweet);
  console.log(`After filtering (own + self-replies, no RTs): ${filtered.length}`);

  const stripped = filtered.map(stripTweet);

  const outDir = join(process.cwd(), 'data');
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }

  const outPath = join(outDir, 'council-tweets.json');
  writeFileSync(outPath, JSON.stringify(stripped, null, 2));
  const sizeMB = (readFileSync(outPath).length / 1024 / 1024).toFixed(1);
  console.log(`Wrote ${stripped.length} tweets to ${outPath} (${sizeMB} MB)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
