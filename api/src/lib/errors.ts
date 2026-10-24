import type { ContentfulStatusCode } from 'hono/utils/http-status';

/**
 * Visos API klaidos grąžinamos vienodu formatu:
 * { "error": { "code": "EMAIL_TAKEN", "message": "…", "details": { "email": "…" } } }
 */
export class ApiError extends Error {
  constructor(
    public status: ContentfulStatusCode,
    public code: string,
    message: string,
    public details?: Record<string, string>,
  ) {
    super(message);
  }

  toJSON() {
    return { error: { code: this.code, message: this.message, ...(this.details ? { details: this.details } : {}) } };
  }
}

export const notFound = (code: string, message: string) => new ApiError(404, code, message);
