/**
 * The dark lower band under the Coaching Toolbox. Each coach route swaps its
 * own content in here; the Figma "Recents" frame is the default.
 */
export function DashboardSection({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section
      aria-label={title}
      className="flex-1 bg-[#151515] px-[23px] pb-6 pt-[17px] text-white"
    >
      <div className="flex items-baseline justify-between">
        <h2 className="text-[11px] font-semibold leading-normal underline decoration-solid underline-offset-[3px]">
          {title}
        </h2>
        {action}
      </div>
      <div className="mt-[21px]">{children}</div>
    </section>
  )
}

/** 4-up card grid matching the Recents spacing (21px columns, 16px rows). */
export function CardGrid({ children }: { children: React.ReactNode }) {
  return <ul className="grid grid-cols-4 gap-x-[21px] gap-y-4">{children}</ul>
}
