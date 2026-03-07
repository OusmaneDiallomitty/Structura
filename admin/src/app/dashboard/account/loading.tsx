export default function Loading() {
  return (
    <div className="max-w-3xl mx-auto px-6 md:px-8 py-8 space-y-6">
      <div className="skeleton h-7 w-36 rounded-xl" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="space-y-4">
          <div className="skeleton h-64 rounded-2xl" />
          <div className="skeleton h-40 rounded-2xl" />
        </div>
        <div className="skeleton h-80 rounded-2xl" />
      </div>
    </div>
  );
}
