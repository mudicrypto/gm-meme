import type { FastifyReply } from 'fastify';
import type { z } from 'zod';

/** Parse input with zod; on failure send a 400 listing the problems and return undefined. */
export function parseOrReply<T extends z.ZodType>(
  schema: T,
  input: unknown,
  reply: FastifyReply,
): z.infer<T> | undefined {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  void reply.status(400).send({
    error: 'Bad Request',
    issues: result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  });
  return undefined;
}
