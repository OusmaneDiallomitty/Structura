export default function Loading() {
  return (
    <div className="max-w-6xl mx-auto px-6 md:px-8 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="skeleton h-7 w-32 rounded-xl" />
        <div className="skeleton h-9 w-28 rounded-xl" />
      </div>
      <div className="skeleton h-14 rounded-2xl" />
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-gray-50 last:border-0">
            <div className="skeleton h-9 w-9 rounded-xl flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-4 w-40 rounded-lg" />
              <div className="skeleton h-3 w-28 rounded-lg" />
            </div>
            <div className="skeleton h-6 w-20 rounded-full" />
            <div className="skeleton h-6 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
