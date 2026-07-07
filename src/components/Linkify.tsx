// 텍스트 속 URL을 클릭 가능한 링크로 렌더 (메모 등)
const URL_RE = /(https?:\/\/[^\s<>"']+)/g

export default function Linkify({ text, className }: { text: string; className?: string }) {
  const parts = text.split(URL_RE)
  return (
    <span className={className}>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-blue-500 hover:text-blue-700 underline break-all"
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </span>
  )
}
