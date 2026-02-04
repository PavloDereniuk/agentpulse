/**
 * Logger Utility
 * 
 * Simple logging with colors and timestamps
 */

import fs from 'fs';
import path from 'path';

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

export class Logger {
  constructor(context = 'App') {
    this.context = context;
    this.logFile = process.env.LOG_FILE || 'logs/agentpulse.log';
    
    // Ensure log directory exists
    const logDir = path.dirname(this.logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  formatMessage(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const contextStr = `[${this.context}]`;
    const levelStr = `[${level.toUpperCase()}]`;
    
    let msg = `${timestamp} ${levelStr} ${contextStr} ${message}`;
    
    if (data) {
      msg += '\n' + JSON.stringify(data, null, 2);
    }
    
    return msg;
  }

  writeToFile(message) {
    try {
      fs.appendFileSync(this.logFile, message + '\n');
    } catch (error) {
      // Silent fail if can't write to file
    }
  }

  info(message, data = null) {
    const formatted = this.formatMessage('info', message, data);
    console.log(`${COLORS.blue}${formatted}${COLORS.reset}`);
    this.writeToFile(formatted);
  }

  success(message, data = null) {
    const formatted = this.formatMessage('success', message, data);
    console.log(`${COLORS.green}${formatted}${COLORS.reset}`);
    this.writeToFile(formatted);
  }

  warn(message, data = null) {
    const formatted = this.formatMessage('warn', message, data);
    console.warn(`${COLORS.yellow}${formatted}${COLORS.reset}`);
    this.writeToFile(formatted);
  }

  error(message, data = null) {
    const formatted = this.formatMessage('error', message, data);
    console.error(`${COLORS.red}${formatted}${COLORS.reset}`);
    this.writeToFile(formatted);
  }

  debug(message, data = null) {
    if (process.env.NODE_ENV === 'development') {
      const formatted = this.formatMessage('debug', message, data);
      console.log(`${COLORS.magenta}${formatted}${COLORS.reset}`);
      this.writeToFile(formatted);
    }
  }
}
