/* eslint-disable no-console */
// src/lib/logger.ts
const LOG_LEVELS = {
  info: 1,
  warning: 2,
  error: 3,
  none: 4,
};

type LogLevel = keyof typeof LOG_LEVELS;

const CURRENT_LOG_LEVEL: LogLevel = "info"; // Change this to control verbosity

class Logger {
  private log(level: LogLevel, component: string, message: string) {
    if (LOG_LEVELS[level] >= LOG_LEVELS[CURRENT_LOG_LEVEL]) {
      if (level === "error") {
        console.error(`[${level.toUpperCase()}] [${component}] ${message}`);
      } else if (level === "warning") {
        console.warn(`[${level.toUpperCase()}] [${component}] ${message}`);
      } else {
        console.log(`[${level.toUpperCase()}] [${component}] ${message}`);
      }
    }
  }

  info(component: string, message: string) {
    this.log("info", component, message);
  }

  warning(component: string, message: string) {
    this.log("warning", component, message);
  }

  error(component: string, message: string) {
    this.log("error", component, message);
  }
}

export const logger = new Logger();
