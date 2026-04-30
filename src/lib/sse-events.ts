// SSE event contract — must stay in sync with app/models.py on the backend.
// Wire format: event: <type>\ndata: <json>\n\n

export type RetrievalStepEvent = {
  type: 'retrieval_step'
  step: 'retrieving' | 'searching' | 'synthesizing'
  detail?: string
}

export type DeltaEvent = {
  type: 'delta'
  text: string
}

export type CitationSource = {
  title: string
}

export type CitationEvent = {
  type: 'citation'
  sources: CitationSource[]
}

export type DoneEvent = {
  type: 'done'
}

export type ErrorEvent = {
  type: 'error'
  code: string
  message: string
}

export type SSEEvent =
  | RetrievalStepEvent
  | DeltaEvent
  | CitationEvent
  | DoneEvent
  | ErrorEvent

// Example wire payloads:
//
// event: retrieval_step
// data: {"step":"retrieving","detail":"searching knowledge base"}
//
// event: delta
// data: {"text":"Mark worked on"}
//
// event: citation
// data: {"sources":[{"title":"Tutor-AI"},{"title":"Portfolio Chatbot"}]}
//
// event: done
// data: {}
//
// event: error
// data: {"code":"upstream_error","message":"models are napping, try again"}
