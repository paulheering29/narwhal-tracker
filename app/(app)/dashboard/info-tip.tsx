// Small italic "i" in a card's top-right corner; the explanation shows on
// hover or keyboard focus. Pure CSS so it works in server and client cards.
// The wrapper has its own z-index because its translate creates a stacking
// context; without it, later positioned content (charts) paints over the tip.
export function InfoTip({ text }: { text: string }) {
  return (
    <span className="group absolute right-0 top-1/2 z-30 -translate-y-1/2">
      <button
        type="button"
        aria-label="About this card"
        className="flex h-5 w-5 items-center justify-center rounded-full border border-gray-300 font-serif text-xs italic leading-none text-gray-400 transition-colors hover:border-gray-500 hover:text-gray-600 focus:border-gray-500 focus:text-gray-600 focus:outline-none"
      >
        i
      </button>
      <span
        role="tooltip"
        className="invisible absolute right-0 top-full z-20 mt-2 w-60 rounded-md bg-gray-900 p-2.5 text-left text-xs font-normal normal-case leading-snug tracking-normal text-white opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
      >
        {text}
      </span>
    </span>
  )
}
