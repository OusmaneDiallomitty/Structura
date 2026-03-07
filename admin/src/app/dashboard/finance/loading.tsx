export default function Loading() {
  return (
    <div className="p-8 space-y-6 max-w-5xl mx-auto animate-pulse">
      <div className="skeleton h-8 w-48 rounded-xl" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}
      </div>
      <div className="skeleton h-72 rounded-2xl" />
      <div className="skeleton h-48 rounded-2xl" />
    </div>
  );
}
