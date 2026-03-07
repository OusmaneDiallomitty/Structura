export default function Loading() {
  return (
    <div className="max-w-6xl mx-auto px-6 md:px-8 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="skeleton h-7 w-44 rounded-xl" />
        <div className="skeleton h-9 w-24 rounded-xl" />
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-50 bg-gray-50/50 flex gap-8">
          {[...Array(5)].map((_, i) => <div key={i} className="skeleton h-4 w-20 rounded-lg" />)}
        </div>
        {[...Array(10)].map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-3.5 border-b border-gray-50 last:border-0">
            <div className="skeleton h-6 w-28 rounded-full" />
            <div className="skeleton h-4 w-32 rounded-lg" />
            <div className="skeleton h-4 w-24 rounded-lg" />
            <div className="skeleton h-4 w-20 rounded-lg ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
