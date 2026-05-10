export default function Footer() {
  return (
    <footer className="bg-white border-t border-surface-200 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center text-sm text-surface-500">
          <p>&copy; {new Date().getFullYear()} MindForum. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
