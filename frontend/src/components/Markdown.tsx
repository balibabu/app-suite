import { useMemo } from 'react'
import DOMPurify from 'dompurify'
import { marked } from 'marked'

marked.setOptions({ breaks: true, gfm: true })

export function renderMarkdown(raw: string): string {
  const spoilered = raw.replace(
    /\|\|([\s\S]*?)\|\|/g,
    (_match, inner: string) =>
      `<span class="spoiler" data-spoiler>${DOMPurify.sanitize(marked.parseInline(inner) as string)}</span>`,
  )
  return DOMPurify.sanitize(marked.parse(spoilered) as string, { ADD_ATTR: ['data-spoiler'] })
}

export default function Markdown({ source, className = '' }: { source: string; className?: string }) {
  const html = useMemo(() => renderMarkdown(source), [source])
  return (
    <div
      className={`markdown ${className}`}
      onClick={(event) => {
        const target = event.target as HTMLElement
        if (target.closest('[data-spoiler]')) {
          const spoiler = target.closest('[data-spoiler]') as HTMLElement | null
          spoiler?.classList.toggle('revealed')
        }
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
