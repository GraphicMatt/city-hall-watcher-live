import VoteMatcher from '@/components/VoteMatcher';

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function VoteMatcherPage({ params }: Props) {
  const { slug } = await params;
  return <VoteMatcher slug={slug} />;
}
