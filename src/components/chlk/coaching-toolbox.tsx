/* eslint-disable @next/next/no-img-element -- the hero photos use the exact
   percent crop geometry from Figma, which next/image's fill mode fights. */

import { toolboxCards, type ToolboxCardData } from "@/lib/chlk/fixtures"

export function CoachingToolbox() {
  return (
    <section
      aria-labelledby="coaching-toolbox-heading"
      className="bg-[#4d5d6c] px-[23px] pb-[26px] pt-6"
    >
      <h1
        id="coaching-toolbox-heading"
        className="text-[14px] font-bold leading-normal tracking-[3px] text-white"
      >
        COACHING TOOLBOX
      </h1>
      <ul className="mt-5 grid grid-cols-3 gap-[18px]">
        {toolboxCards.map((card) => (
          <li key={card.id}>
            <ToolboxCard card={card} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function ToolboxCard({ card }: { card: ToolboxCardData }) {
  const [line1, line2] = card.title.split("\n")

  return (
    <button
      type="button"
      className="block w-full overflow-hidden rounded-[13px] text-left shadow-[0_4px_14px_rgba(0,0,0,0.28)] transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e1f2fb]"
    >
      <div className="relative aspect-[255/173] w-full overflow-hidden bg-[#2b3a47]">
        <img
          alt=""
          src={card.image}
          className="absolute block max-w-none"
          style={card.crop}
        />
        {card.overlay ? (
          <img
            alt=""
            src={card.overlay}
            className="absolute inset-0 block size-full max-w-none"
          />
        ) : null}
        <p className="absolute bottom-[14px] left-[23px] text-[24px] font-bold leading-normal text-white">
          {line1}
          <br />
          {line2}
        </p>
      </div>
      <div className="flex h-[37px] items-center bg-[#f9f5ec] px-[23px] text-[10px] font-semibold uppercase leading-normal tracking-[1px] text-[#3f3f3f]">
        {card.tool}
      </div>
    </button>
  )
}
