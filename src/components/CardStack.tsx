type Props = {
  count: number
  label: string
}

export default function CardStack({ count, label }: Props) {
  const initials = label.slice(0, 2).toUpperCase()

  return (
    <div className="flex flex-col items-center gap-1" data-testid={`avatar-${label}`}>
      {/* Avatar circle */}
      <div className="w-10 h-10 rounded-full bg-indigo-700 border-2 border-indigo-400 flex items-center justify-center">
        <span className="text-white text-xs font-bold">{initials}</span>
      </div>
      {/* Name + card count */}
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-white text-xs font-semibold leading-none max-w-20 truncate">{label}</span>
        <span className="bg-gray-800 text-white text-xs font-bold px-2 py-0.5 rounded-full leading-none" data-testid={`card-count-${label}`}>
          {count}
        </span>
      </div>
    </div>
  )
}
