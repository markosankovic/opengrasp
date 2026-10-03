/** Yields the data of each server-sent event in a streamed response body; multi-line data is joined with newlines. */
export async function* sseData(body: NonNullable<Response['body']>): AsyncGenerator<string> {
  let buffer = ''
  const reader = body.pipeThrough(new TextDecoderStream()).getReader()
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += value
      // Events are separated by a blank line; each carries its payload in one or more data lines.
      let end: number
      while ((end = buffer.search(/\r?\n\r?\n/)) !== -1) {
        const event = buffer.slice(0, end)
        buffer = buffer.slice(end).replace(/^\r?\n\r?\n/, '')
        const data = event
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n')
        if (data) yield data
      }
    }
  } finally {
    reader.releaseLock()
  }
}
