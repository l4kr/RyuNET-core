import winston from 'winston';
import chalk from 'chalk';
import path from 'path';

const isDebug = (process as any).pkg == null;

// Same base directory as savedata/ and plugins/ (computed independently here
// to avoid a circular import with EamuseIO.ts, which itself imports Logger).
// Pinning this to an absolute path means log.txt always lives right next to
// your savedata/plugins folders, no matter what directory you launch the
// server from.
const EXEC_PATH = path.resolve((process as any).pkg ? path.dirname(process.argv0) : process.cwd());
export const LOG_FILE_PATH = path.join(EXEC_PATH, 'log.txt');

export const Logger = winston.createLogger({
  level: isDebug ? 'debug' : 'info',
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.printf(info => {
      let stack = '';
      if (info.stack) {
        stack += `\n${info.stack}`;
      } else if (info.message && (info.message as any).stack) {
        stack += `\n${(info.message as any).stack}`;
      }

      const plugin =
        info.plugin == 'core' ? chalk.cyanBright('core') : chalk.yellowBright(info.plugin);
      if (info.level.indexOf('info') < 0) {
        return `  [${plugin}] ${info.level}: ${info.message}` + stack;
      } else {
        if (info.plugin == 'core') {
          return `${info.message}`;
        }
        return `  [${plugin}] ${info.message}` + stack;
      }
    })
  ),
  defaultMeta: { plugin: 'core' },
  transports: [
    new winston.transports.Console({
      stderrLevels: ['error'],
      debugStdout: true,
    }),
    new winston.transports.File({ filename: LOG_FILE_PATH }),
  ],
});

// winston's File transport writes asynchronously. Several call sites in this
// codebase log a fatal error and immediately call process.exit() right after
// -- Node can (and does) exit before that async write reaches disk, leaving
// log.txt completely empty for exactly the errors that matter most. This
// writes the fatal line synchronously, directly to the same log file, before
// exiting, so it's guaranteed to be on disk no matter what.
export function fatalExit(message: string, code = 1): never {
  Logger.error(message);
  try {
    const line = `${new Date().toISOString()} [fatal] ${message}\n`;
    require('fs').appendFileSync(LOG_FILE_PATH, line);
  } catch {
    // If we can't even write the log file synchronously, there's nothing
    // more we can do here -- still exit with the intended code.
  }
  process.exit(code);
}
