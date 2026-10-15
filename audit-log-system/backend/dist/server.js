"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const env_js_1 = require("./config/env.js");
const cassandra_js_1 = require("./config/cassandra.js");
const index_js_1 = __importDefault(require("./routes/index.js"));
const errorHandler_js_1 = require("./middleware/errorHandler.js");
const app = (0, express_1.default)();
// Middleware
app.use((0, cors_1.default)({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
// Request Logger
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[HTTP] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`);
    });
    next();
});
// Root Healthcheck
app.get('/', (req, res) => {
    res.json({
        name: 'Enterprise Audit Log Monitoring System API',
        database: 'Apache Cassandra (Wide Column NoSQL)',
        version: '1.0.0',
        status: 'ACTIVE',
    });
});
// API Routes
app.use('/api', index_js_1.default);
// Global Error Handler
app.use(errorHandler_js_1.errorHandler);
// Start Server
async function startServer() {
    console.log('====================================================');
    console.log('   AUDIT LOG & SYSTEM OPERATION MONITORING BACKEND   ');
    console.log('   Primary Database: Apache Cassandra (NoSQL)       ');
    console.log('====================================================');
    // Connect to Cassandra
    const connected = await (0, cassandra_js_1.connectCassandra)();
    if (!connected) {
        console.warn('[WARNING] Could not immediately connect to Cassandra. Server will still start and retry on incoming requests.');
    }
    const server = app.listen(env_js_1.env.PORT, () => {
        console.log(`[Server] REST API listening on port ${env_js_1.env.PORT} -> http://localhost:${env_js_1.env.PORT}`);
        console.log(`[Server] Health Endpoint -> http://localhost:${env_js_1.env.PORT}/api/health`);
    });
    // Graceful Shutdown
    const shutdown = async () => {
        console.log('\n[Server] Shutting down gracefully...');
        server.close(async () => {
            await (0, cassandra_js_1.closeCassandra)();
            console.log('[Server] Process terminated.');
            process.exit(0);
        });
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
}
startServer();
exports.default = app;
