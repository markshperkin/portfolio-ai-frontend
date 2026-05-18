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

export type ActionEvent = {
  type: 'action'
  action_type: 'download' | 'open'
  url: string
}

export type ModelEvent = {
  type: 'model'
  model: 'haiku' | 'sonnet'
}

export type SSEEvent =
  | RetrievalStepEvent
  | DeltaEvent
  | CitationEvent
  | DoneEvent
  | ErrorEvent
  | ActionEvent
  | ModelEvent
