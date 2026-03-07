export default function Loading() {
  return (
    <div className="max-w-4xl mx-auto px-6 md:px-8 py-8 space-y-6">
      <div className="skeleton h-7 w-28 rounded-xl" />
      <div className="grid grid-cols-3 gap-3">
        {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}
      </div>
      {[...Array(3)].map((_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center gap-2">
            <div className="skeleton h-5 w-5 rounded-full" />
            <div className="skeleton h-5 w-32 rounded-lg" />
          </div>
          {[...Array(2)].map((_, j) => (
            <div key={j} className="px-5 py-4 border-b border-gray-50 last:border-0">
              <div className="skeleton h-4 w-48 rounded-lg mb-2" />
              <div className="skeleton h-3 w-64 rounded-lg" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
