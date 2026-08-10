import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '意见反馈',
  description: '向社区提交反馈',
};

export default function FeedbackLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
