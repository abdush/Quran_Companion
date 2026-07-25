/**
 * GENERATED FILE — DO NOT EDIT.
 * Source: schemas/openapi/qds.yaml
 * Regenerate: pnpm --dir tools/codegen generate
 */

export type paths = {
    "/v1/quran/verses/{verse_key}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Resolve a verse by canonical key
         * @description Returns the verse addressed by `surah:ayah`, optionally expanded with word records and translations. Field selection keeps payloads small for client caches.
         */
        get: operations["get_verse"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/quran/pages/{mushaf_id}/{page}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Layout of one mushaf page
         * @description Returns the line/word layout of a page in a specific mushaf edition. Word keys are layout-independent; the page/line placement is layout-dependent (§6.1).
         */
        get: operations["get_page"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/quran/words/{word_key}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Resolve a single word by canonical key
         * @description Returns the word addressed by `surah:ayah:word_position`, with gloss, transliteration, and morphology references when available.
         */
        get: operations["get_word"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/quran/audio/{reciter_id}/{verse_key}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Audio index for one ayah and reciter
         * @description Returns the CDN location and (optionally) word-level timing segments for an ayah recording. Audio itself streams from the CDN; this endpoint only serves the index (§6.3 — audio is not packed by default).
         */
        get: operations["get_audio_index"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
};
export type webhooks = Record<string, never>;
export type components = {
    schemas: {
        /**
         * @description `surah:ayah`; surah 1–114, ayah ≥ 1 (bounds validated server-side).
         * @example 2:255
         */
        verse_key: string;
        /**
         * @description `surah:ayah:word_position`; word_position follows the space-split ordering of the QPC Ḥafṣ text (§6.1).
         * @example 2:255:3
         */
        word_key: string;
        /**
         * @description Layout+script edition identifier.
         * @example qpc-hafs-madani-604
         */
        mushaf_id: string;
        /** @description A verse resolved from canonical reference data. Text originates from the checksummed QDS dataset only (D-003, R3). */
        verse: {
            verse_key: components["schemas"]["verse_key"];
            surah: number;
            ayah: number;
            /** @description Version of the underlying text dataset (drives the ETag). */
            dataset_version: string;
            /** @description Uthmani text; present when `fields` includes `text`. */
            text?: string;
            /** @description Present when `fields` includes `words`. */
            words?: components["schemas"]["word"][];
            /** @description Present when `fields` includes `translations`. */
            translations?: components["schemas"]["translation"][];
        };
        word: {
            word_key: components["schemas"]["word_key"];
            surah: number;
            ayah: number;
            word_position: number;
            /** @description Word text in the requested script edition. */
            text?: string;
            transliteration?: string;
            /** @description Word-by-word translation in the requested locale. */
            gloss?: string;
            /** @description Opaque reference into the morphology dataset (e.g. QAC location id). */
            morphology_ref?: string;
        };
        translation: {
            /**
             * @description Translation resource id from the licensing registry.
             * @example en-sahih
             */
            translation_id: string;
            text: string;
            /**
             * @description BCP 47 language tag.
             * @example en
             */
            language?: string;
        };
        page: {
            mushaf_id: components["schemas"]["mushaf_id"];
            page: number;
            dataset_version: string;
            lines: components["schemas"]["page_line"][];
        };
        page_line: {
            line_number: number;
            /** @enum {string} */
            line_type: "ayah" | "surah_name" | "basmallah";
            /** @description Word keys placed on this line, in reading order (RTL). Empty for non-`ayah` lines. */
            words?: components["schemas"]["word_key"][];
        };
        audio_index: {
            reciter_id: string;
            verse_key: components["schemas"]["verse_key"];
            /**
             * Format: uri
             * @description CDN URL of the ayah recording.
             */
            audio_url: string;
            /** @enum {string} */
            format: "mp3" | "opus";
            duration_ms?: number;
            /** @description Word-level timings; present when `segments=true` and timing data exists for this reciter. */
            segments?: components["schemas"]["audio_segment"][];
        };
        audio_segment: {
            word_position: number;
            start_ms: number;
            end_ms: number;
        };
        /** @description RFC 9457 problem details. */
        problem: {
            /**
             * Format: uri
             * @default about:blank
             */
            type: string;
            title?: string;
            status?: number;
            detail?: string;
            instance?: string;
        } & {
            [key: string]: unknown;
        };
    };
    responses: {
        /** @description Representation unchanged for the presented `If-None-Match` validator. */
        not_modified: {
            headers: {
                ETag: components["headers"]["ETag"];
                [name: string]: unknown;
            };
            content?: never;
        };
        /** @description Malformed key or parameters. */
        bad_request: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["problem"];
            };
        };
        /** @description No resource at this canonical key (or unknown mushaf/reciter/translation id). */
        not_found: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["problem"];
            };
        };
        /** @description Any other error, as RFC 9457 problem details. */
        problem: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["problem"];
            };
        };
    };
    parameters: {
        /** @description Canonical verse key `surah:ayah` (§6.1). */
        verse_key: components["schemas"]["verse_key"];
        /** @description Canonical word key `surah:ayah:word_position` (§6.1). */
        word_key: components["schemas"]["word_key"];
        /** @description Conditional revalidation against a previously returned `ETag`. */
        if_none_match: string;
    };
    requestBodies: never;
    headers: {
        /** @description Strong validator for this representation; changes when the underlying dataset version changes. */
        ETag: string;
        /** @description QDS responses are publicly cacheable. */
        CacheControl: string;
    };
    pathItems: never;
};
export type $defs = Record<string, never>;
export interface operations {
    get_verse: {
        parameters: {
            query?: {
                /** @description Comma-separated projection. Default `text`. */
                fields?: string;
                /** @description Comma-separated translation resource ids (only with `fields=translations`). */
                translation_ids?: string;
            };
            header?: {
                /** @description Conditional revalidation against a previously returned `ETag`. */
                "If-None-Match"?: components["parameters"]["if_none_match"];
            };
            path: {
                /** @description Canonical verse key `surah:ayah` (§6.1). */
                verse_key: components["parameters"]["verse_key"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Verse resolved. */
            200: {
                headers: {
                    ETag: components["headers"]["ETag"];
                    "Cache-Control": components["headers"]["CacheControl"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["verse"];
                };
            };
            304: components["responses"]["not_modified"];
            400: components["responses"]["bad_request"];
            404: components["responses"]["not_found"];
            default: components["responses"]["problem"];
        };
    };
    get_page: {
        parameters: {
            query?: never;
            header?: {
                /** @description Conditional revalidation against a previously returned `ETag`. */
                "If-None-Match"?: components["parameters"]["if_none_match"];
            };
            path: {
                /** @description Layout+script edition id, e.g. `qpc-hafs-madani-604`. */
                mushaf_id: components["schemas"]["mushaf_id"];
                page: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Page layout. */
            200: {
                headers: {
                    ETag: components["headers"]["ETag"];
                    "Cache-Control": components["headers"]["CacheControl"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["page"];
                };
            };
            304: components["responses"]["not_modified"];
            400: components["responses"]["bad_request"];
            404: components["responses"]["not_found"];
            default: components["responses"]["problem"];
        };
    };
    get_word: {
        parameters: {
            query?: never;
            header?: {
                /** @description Conditional revalidation against a previously returned `ETag`. */
                "If-None-Match"?: components["parameters"]["if_none_match"];
            };
            path: {
                /** @description Canonical word key `surah:ayah:word_position` (§6.1). */
                word_key: components["parameters"]["word_key"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Word resolved. */
            200: {
                headers: {
                    ETag: components["headers"]["ETag"];
                    "Cache-Control": components["headers"]["CacheControl"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["word"];
                };
            };
            304: components["responses"]["not_modified"];
            400: components["responses"]["bad_request"];
            404: components["responses"]["not_found"];
            default: components["responses"]["problem"];
        };
    };
    get_audio_index: {
        parameters: {
            query?: {
                /** @description Include word-level timing segments. */
                segments?: boolean;
            };
            header?: {
                /** @description Conditional revalidation against a previously returned `ETag`. */
                "If-None-Match"?: components["parameters"]["if_none_match"];
            };
            path: {
                reciter_id: string;
                /** @description Canonical verse key `surah:ayah` (§6.1). */
                verse_key: components["parameters"]["verse_key"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Audio index entry. */
            200: {
                headers: {
                    ETag: components["headers"]["ETag"];
                    "Cache-Control": components["headers"]["CacheControl"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["audio_index"];
                };
            };
            304: components["responses"]["not_modified"];
            400: components["responses"]["bad_request"];
            404: components["responses"]["not_found"];
            default: components["responses"]["problem"];
        };
    };
}
