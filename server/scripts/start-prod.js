/** Cross-platform production start (PowerShell has no inline `NODE_ENV=production`). */
process.env.NODE_ENV = 'production';
require('../server.js');
