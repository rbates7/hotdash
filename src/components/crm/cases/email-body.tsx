export function EmailBody({
  text,
}: {
  html: string | null
  text: string | null
}) {
  return (
    <div className="rounded-md bg-muted/40 px-3.5 py-3 text-sm whitespace-pre-wrap">
      {text ?? "(empty message)"}
    </div>
  )
}
