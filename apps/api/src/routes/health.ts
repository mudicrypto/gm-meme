import type { FastifyPluginAsync } from 'fastify';
import type { Config } from '../config';

export const healthRoutes: FastifyPluginAsync<{ config: Config }> = async (app, { config }) => {
  app.get('/health', async () => ({
    status: 'ok',
    cluster: config.SOLANA_CLUSTER,
  }));
};
