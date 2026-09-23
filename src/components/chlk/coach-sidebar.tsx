"use client"

/* eslint-disable @next/next/no-img-element -- icons are static Figma SVG
   exports at their intrinsic size; next/image adds nothing here. */

import Link from "next/link"
import { usePathname } from "next/navigation"

import { coachNavItems, isActiveCoachRoute } from "@/lib/chlk/nav"
import { cn } from "@/lib/utils"

function Divider() {
  return (
    <img
      alt=""
      aria-hidden
      src="/chlk/divider.svg"
      className="block h-px w-full max-w-none"
    />
  )
}

export function CoachSidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex h-full w-[177px] shrink-0 flex-col bg-[#333333] px-2 text-white">
      {/* Account row: avatar, name + menu chevron, notifications. */}
      <div className="mt-[18px] flex h-[26px] items-center pl-1">
        <button
          type="button"
          className="flex items-center gap-1.5"
          aria-label="Account menu for Coach Casey"
        >
          <span className="relative block size-[26px]">
            <img
              alt=""
              src="/chlk/avatar-circle.svg"
              className="absolute inset-0 block size-full max-w-none"
            />
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-[#e1f2fb]">
              CC
            </span>
          </span>
          <span className="text-[10px] font-bold leading-normal">Coach Casey</span>
          <img
            alt=""
            src="/chlk/chevron.svg"
            className="ml-[3px] block h-[4.06px] w-[6.7px] max-w-none rotate-180"
          />
        </button>
        <button
          type="button"
          className="ml-auto mr-2 block h-[19px] w-[18px]"
          aria-label="Notifications, 1 unread"
        >
          <img
            alt=""
            src="/chlk/bell.svg"
            className="block h-[19px] w-[18px] max-w-none"
          />
        </button>
      </div>

      <div className="mt-4">
        <Divider />
      </div>

      {/* Search */}
      <label className="relative mt-[18px] block h-[29px]">
        <span className="sr-only">Search plays and playbooks</span>
        <img
          alt=""
          src="/chlk/search.svg"
          className="pointer-events-none absolute left-2 top-[10px] block h-[9px] w-[8.5px] max-w-none"
        />
        <input
          type="search"
          placeholder="Search"
          className="h-full w-full rounded-[4px] border-[0.35px] border-[#d9d9d9] bg-[#3f3f3f] pl-[23px] pr-2 text-[10px] leading-normal text-white outline-none placeholder:text-[#abaaaa] focus-visible:border-[#2b76ba]"
        />
      </label>

      {/* Primary: Recents */}
      <nav aria-label="Coach" className="mt-[18px]">
        <NavLink item={coachNavItems[0]} active={isActiveCoachRoute(pathname, "/")} />

        <div className="my-[18px] mb-3">
          <Divider />
        </div>

        <ul className="flex flex-col gap-1.5">
          {coachNavItems.slice(1).map((item) => (
            <li key={item.href}>
              <NavLink item={item} active={isActiveCoachRoute(pathname, item.href)} />
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  )
}

function NavLink({
  item,
  active,
}: {
  item: (typeof coachNavItems)[number]
  active: boolean
}) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-[23px] items-center rounded-[4px] pl-2 text-[10px] leading-normal text-white transition-colors",
        active
          ? "bg-[rgba(43,118,186,0.5)] font-semibold"
          : "font-normal hover:bg-white/5",
      )}
    >
      <span className="flex w-[19px] shrink-0 items-center">
        {item.href === "/" ? <ClockIcon /> : (
          <img
            alt=""
            src={item.icon}
            width={item.iconSize.width}
            height={item.iconSize.height}
            className="block max-w-none"
            style={{ width: item.iconSize.width, height: item.iconSize.height }}
          />
        )}
      </span>
      {item.label}
    </Link>
  )
}

/** The Recents clock is two Figma layers: a ring and a separate hand. */
function ClockIcon() {
  return (
    <span className="relative block size-[9px]">
      <img
        alt=""
        src="/chlk/clock-ring.svg"
        className="absolute inset-0 block size-full max-w-none"
      />
      <span className="absolute left-[4.5px] top-[2.26px] h-[3.008px] w-[1.125px]">
        <span className="absolute inset-[-16.62%_-44.45%_-9.95%_-44.45%] block">
          <img
            alt=""
            src="/chlk/clock-hand.svg"
            className="block size-full max-w-none"
          />
        </span>
      </span>
    </span>
  )
}
