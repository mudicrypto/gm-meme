import Fastify from 'fastify';
import type { Config } from './config';
import { healthRoutes } from './routes/health';

/** Build the Fastify app without listening, so tests can use app.inject(). */
export function buildApp(config: Config) {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      // Keep secrets out of request logs.
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    },
  });

  app.register(healthRoutes, { config });

  return app;
}
