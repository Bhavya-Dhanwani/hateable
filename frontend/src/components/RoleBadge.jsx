const STYLES = {
  owner: 'border-rose-400/30 bg-rose-400/10 text-rose-200',
  admin: 'border-violet-400/30 bg-violet-400/10 text-violet-200',
  editor: 'border-sky-400/30 bg-sky-400/10 text-sky-200',
  viewer: 'border-white/15 bg-white/5 text-white/55'
};

export function RoleBadge({ role }) {
  return (
    <span
      className={`inline-flex h-5 shrink-0 items-center rounded-full border px-2 text-[10px] font-medium capitalize ${STYLES[role] || STYLES.viewer}`}
    >
      {role}
    </span>
  );
}
