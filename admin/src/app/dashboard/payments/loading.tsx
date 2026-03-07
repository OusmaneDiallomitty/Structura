export default function PaymentsLoading() {
  return (
    <div className="max-w-7xl mx-auto px-6 md:px-8 py-8 space-y-6 animate-pulse">
      <div className="skeleton h-8 w-48 rounded-xl" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-20 rounded-2xl" />)}
      </div>
      <div className="skeleton h-14 rounded-2xl" />
      <div className="skeleton h-96 rounded-2xl" />
    </div>
  );
}
