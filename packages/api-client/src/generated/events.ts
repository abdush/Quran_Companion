/**
 * GENERATED FILE — DO NOT EDIT.
 * Source: schemas/events/*.json
 * Regenerate: pnpm --dir tools/codegen generate
 */

/**
 * Common envelope for every event on the Redis Streams bus (Handbook §9.2). Producers validate against the concrete event schema (envelope + payload) before publishing; consumers are idempotent keyed on event_id (R6).
 */
export interface EventEnvelope {
  /**
   * Unique per event; idempotency key for consumers (at-least-once delivery).
   */
  event_id: string;
  /**
   * Dotted event type; also the stream name (one stream per type).
   */
  type: string;
  /**
   * UTC timestamp at the producer, RFC 3339.
   */
  occurred_at: string;
  /**
   * Profile the event belongs to. IDs only — never note bodies, transcripts, or user-linked audio paths in logs (R7).
   */
  profile_id: string;
  /**
   * Event-type-specific body; constrained by the concrete event schema.
   */
  payload: {};
  /**
   * Version of the concrete event schema the payload conforms to.
   */
  schema_version: number;
}

/**
 * Published by the speech worker when ASR, alignment, and diff classification finish for a recitation test (Handbook §9.2/§9.3). Consumed by the memorisation (hfz) context. Transcript and error-list bodies stay in object storage — the event carries references only (R7). schema_version 1.
 */
export type SpeechTranscriptReady = EventEnvelope & {
  type: 'speech.transcript.ready';
  schema_version: 1;
  payload: {
    /**
     * Recitation test this result belongs to.
     */
    test_id: string;
    /**
     * Object-storage reference to the aligned transcript artifact.
     */
    transcript_ref: string;
    /**
     * Object-storage reference to the classified error-list artifact (§13.3 taxonomy). Absent when the recitation had no detected errors.
     */
    errors_ref?: string;
    /**
     * Word error rate of the recitation against the canonical range.
     */
    wer: number;
    /**
     * ASR model identifier used, for benchmark traceability (§23 speech bench).
     */
    model_version: string;
  };
};

/**
 * Common envelope for every event on the Redis Streams bus (Handbook §9.2). Producers validate against the concrete event schema (envelope + payload) before publishing; consumers are idempotent keyed on event_id (R6).
 */
export interface EventEnvelope {
  /**
   * Unique per event; idempotency key for consumers (at-least-once delivery).
   */
  event_id: string;
  /**
   * Dotted event type; also the stream name (one stream per type).
   */
  type: string;
  /**
   * UTC timestamp at the producer, RFC 3339.
   */
  occurred_at: string;
  /**
   * Profile the event belongs to. IDs only — never note bodies, transcripts, or user-linked audio paths in logs (R7).
   */
  profile_id: string;
  /**
   * Event-type-specific body; constrained by the concrete event schema.
   */
  payload: {};
  /**
   * Version of the concrete event schema the payload conforms to.
   */
  schema_version: number;
}

/**
 * Published by the API (hfz context) after the client confirms upload of a recitation-test recording to object storage (Handbook §9.3). Consumed by the speech worker. schema_version 1.
 */
export type TestAudioUploaded = EventEnvelope & {
  type: 'test.audio.uploaded';
  schema_version: 1;
  payload: {
    /**
     * Recitation test this recording belongs to.
     */
    test_id: string;
    /**
     * Object-storage reference to the uploaded audio. Bucket-internal path only; must not encode user identity (R7).
     */
    audio_ref: string;
    /**
     * MIME type of the recording.
     */
    content_type: string;
    /**
     * Client-reported duration; the worker re-measures after VAD.
     */
    duration_ms?: number;
    /**
     * Canonical recited range (§6.1) so the worker can fetch the reference text by key — never inline Quran text in events (D-003).
     */
    range: {
      start: string;
      end: string;
    };
  };
};

/**
 * Common envelope for every event on the Redis Streams bus (Handbook §9.2). Producers validate against the concrete event schema (envelope + payload) before publishing; consumers are idempotent keyed on event_id (R6).
 */
export interface EventEnvelope {
  /**
   * Unique per event; idempotency key for consumers (at-least-once delivery).
   */
  event_id: string;
  /**
   * Dotted event type; also the stream name (one stream per type).
   */
  type: string;
  /**
   * UTC timestamp at the producer, RFC 3339.
   */
  occurred_at: string;
  /**
   * Profile the event belongs to. IDs only — never note bodies, transcripts, or user-linked audio paths in logs (R7).
   */
  profile_id: string;
  /**
   * Event-type-specific body; constrained by the concrete event schema.
   */
  payload: {};
  /**
   * Version of the concrete event schema the payload conforms to.
   */
  schema_version: number;
}

