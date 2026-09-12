export function AuthDivider() {
  return (
    <div className="relative my-6">
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t border-[var(--color-border)]" />
      </div>
      <div className="relative flex justify-center text-xs uppercase">
        <span className="bg-[var(--color-surface)] px-2 text-[var(--color-text-muted)]">
          or
        </span>
      </div>
    </div>
  );
}
