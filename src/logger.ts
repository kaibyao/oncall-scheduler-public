import { pino, type Logger as PinoLogger } from 'pino';
import pretty from 'pino-pretty';
import { IS_PRODUCTION } from './config.js';

export class Logger {
  private readonly logger: PinoLogger;

  constructor(namespace: string, level?: string) {
    const logLevel = level || process.env.LOG_LEVEL || 'info';

    this.logger = IS_PRODUCTION
      ? pino({
          name: namespace,
          level: logLevel,
        })
      : pino(
          pretty({
            colorize: true,
            ignore: 'pid,hostname,dd',
            destination: pino.destination({
              sync: true,
            }),
            sync: true,
          }),
        );

    // Apply log level to pretty logger too
    if (!IS_PRODUCTION) {
      this.logger.level = logLevel;
    }
  }

  error(message: string, data?: unknown) {
    this.logger.error(data, message);
  }

  warn(message: string, data?: unknown) {
    this.logger.warn(data, message);
  }

  info(message: string, data?: unknown) {
    this.logger.info(data, message);
  }

  debug(message: string, data?: unknown) {
    this.logger.debug(data, message);
  }

  trace(message: string, data?: unknown) {
    this.logger.trace(data, message);
  }

  /**
   * Flush any pending log messages to ensure all logs are written
   * Particularly useful in test environments to prevent hanging
   */
  async flush(): Promise<void> {
    return new Promise((resolve) => {
      this.logger.flush(() => resolve());
    });
  }
}
