'use client';

/**
 * Resources layout wrapper — provides a responsive container that
 * prevents horizontal overflow on all viewport sizes.
 *
 * Task 3 of layout-responsive plan.
 */
export default function ResourcesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      data-testid="resources-container"
      className="min-w-0 overflow-x-hidden"
    >
      {children}
    </div>
  );
}
