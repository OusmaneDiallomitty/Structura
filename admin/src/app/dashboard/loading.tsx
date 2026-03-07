export default function Loading() {
  return (
    <div className="max-w-6xl mx-auto px-6 md:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="skeleton h-7 w-44 rounded-xl" />
      {/* Métriques */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-36 rounded-2xl" />)}
      </div>
      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 skeleton h-56 rounded-2xl" />
        <div className="skeleton h-56 rounded-2xl" />
      </div>
      {/* Feeds */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="skeleton h-60 rounded-2xl" />
        <div className="skeleton h-60 rounded-2xl" />
      </div>
    </div>
  );
}
