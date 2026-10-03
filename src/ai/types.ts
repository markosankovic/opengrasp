/** One turn of a conversation, in the role names Gemini uses. */
export interface ChatMessage {
  role: 'user' | 'model'
  text: string
}

/** Text the reader selected in the PDF, attached to a question. */
export interface Quote {
  text: string
  pageNumber: number
}
