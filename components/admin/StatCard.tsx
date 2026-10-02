export function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border border-neutral-200 p-4">
      <dt className="text-xs tracking-wide text-neutral-500 uppercase">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold">{value}</dd>
    </div>
  );
}
