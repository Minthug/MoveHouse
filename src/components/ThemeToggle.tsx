export type ThemeMode = 'light' | 'dark'

interface Props {
  mode: ThemeMode
  isDark: boolean
  onChange: (mode: ThemeMode) => void
}

const NEXT_MODE: Record<ThemeMode, ThemeMode> = {
  light: 'dark',
  dark: 'light',
}

const LABELS: Record<ThemeMode, string> = {
  light: '라이트',
  dark: '다크',
}

export default function ThemeToggle({ mode, isDark, onChange }: Props) {
  const next = NEXT_MODE[mode]

  return (
    <button
      type="button"
      onClick={() => onChange(next)}
      className="inline-flex h-9 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 text-xs font-bold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 active:scale-95"
      title={`테마 변경: 다음 ${LABELS[next]}`}
      aria-label={`현재 테마 ${LABELS[mode]}`}
    >
      <span className="text-sm leading-none">{isDark ? '☾' : '☼'}</span>
      <span>{LABELS[mode]}</span>
    </button>
  )
}
