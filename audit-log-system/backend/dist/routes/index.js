"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auditLogController_js_1 = require("../controllers/auditLogController.js");
const serviceController_js_1 = require("../controllers/serviceController.js");
const demoController_js_1 = require("../controllers/demoController.js");
const authController_js_1 = require("../controllers/authController.js");
const userController_js_1 = require("../controllers/userController.js");
const auth_js_1 = require("../middleware/auth.js");
const cassandra_js_1 = require("../config/cassandra.js");
const env_js_1 = require("../config/env.js");
const router = (0, express_1.Router)();
// ============================================================================
// PUBLIC SYSTEM HEALTH CHECK (For load balancer / monitoring)
// ============================================================================
router.get('/health', async (req, res) => {
    const dbHealth = await (0, cassandra_js_1.isCassandraHealthy)();
    if (dbHealth.healthy) {
        res.status(200).json({
            success: true,
            status: 'UP',
            service: 'Audit Log Backend API',
            cassandra: dbHealth.details,
            timestamp: new Date().toISOString(),
        });
    }
    else {
        res.status(503).json({
            success: false,
            status: 'DEGRADED',
            message: 'Database temporarily unavailable',
            error: dbHealth.error,
        });
    }
});
// ============================================================================
// SYSTEM STATUS ROUTE (ADMIN ONLY - HTTP 403 for others)
// ============================================================================
router.get('/system/status', auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN'), async (req, res) => {
    const dbHealth = await (0, cassandra_js_1.isCassandraHealthy)();
    res.status(dbHealth.healthy ? 200 : 503).json({
        success: dbHealth.healthy,
        cassandra: {
            connected: dbHealth.healthy,
            contactPoints: env_js_1.env.CASSANDRA_CONTACT_POINTS,
            port: env_js_1.env.CASSANDRA_PORT,
            keyspace: env_js_1.env.CASSANDRA_KEYSPACE,
            datacenter: env_js_1.env.CASSANDRA_LOCAL_DATA_CENTER,
            details: dbHealth.details || null,
            error: dbHealth.error || null,
        },
        systemInfo: {
            uptime_seconds: process.uptime(),
            node_version: process.version,
            memory_usage: process.memoryUsage(),
            nodetool_help: 'Run: docker exec cassandra_audit_node nodetool status',
        },
    });
});
// ============================================================================
// AUTHENTICATION ROUTES
// ============================================================================
router.post('/auth/register', (req, res, next) => authController_js_1.authController.register(req, res, next));
router.post('/auth/login', (req, res, next) => authController_js_1.authController.login(req, res, next));
router.post('/auth/logout', auth_js_1.authenticate, (req, res, next) => authController_js_1.authController.logout(req, res, next));
router.get('/auth/me', auth_js_1.authenticate, (req, res, next) => authController_js_1.authController.me(req, res, next));
router.put('/auth/change-password', auth_js_1.authenticate, (req, res, next) => authController_js_1.authController.changePassword(req, res, next));
// ============================================================================
// USER MANAGEMENT ROUTES (ADMIN ONLY - HTTP 403 for others)
// ============================================================================
router.get('/users', auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN'), (req, res, next) => userController_js_1.userController.getAll(req, res, next));
router.post('/users', auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN'), (req, res, next) => userController_js_1.userController.create(req, res, next));
router.put('/users/:id', auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN'), (req, res, next) => userController_js_1.userController.update(req, res, next));
router.delete('/users/:id', auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN'), (req, res, next) => userController_js_1.userController.delete(req, res, next));
router.patch('/users/:id/role', auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN'), (req, res, next) => userController_js_1.userController.changeRole(req, res, next));
router.patch('/users/:id/status', auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN'), (req, res, next) => userController_js_1.userController.changeStatus(req, res, next));
// ============================================================================
// AUDIT LOG ROUTES
// Read: ADMIN, OPERATOR, VIEWER
// Write / TTL: ADMIN, OPERATOR
// ============================================================================
router.get('/logs', auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN', 'OPERATOR', 'VIEWER'), (req, res, next) => auditLogController_js_1.auditLogController.getLogs(req, res, next));
router.get('/logs/detail', auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN', 'OPERATOR', 'VIEWER'), (req, res, next) => auditLogController_js_1.auditLogController.getLogDetail(req, res, next));
router.get('/logs/stats/summary', auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN', 'OPERATOR', 'VIEWER'), (req, res, next) => auditLogController_js_1.auditLogController.getStatsSummary(req, res, next));
router.get('/logs/:id', auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN', 'OPERATOR', 'VIEWER'), (req, res, next) => auditLogController_js_1.auditLogController.getLogById(req, res, next));
// Ingestion and TTL Logs
router.post('/logs', auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN', 'OPERATOR'), (req, res, next) => auditLogController_js_1.auditLogController.createLog(req, res, next));
router.post('/logs/ttl-demo', auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN'), (req, res, next) => auditLogController_js_1.auditLogController.createTtlDemoLog(req, res, next));
router.get('/logs/ttl-status/:id', auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN'), (req, res, next) => auditLogController_js_1.auditLogController.getTtlStatus(req, res, next));
// ============================================================================
// SERVICE CATALOG MANAGEMENT ROUTES
// Read: ADMIN, OPERATOR (VIEWER cannot access Services)
// Mutate: ADMIN ONLY
// ============================================================================
router.get('/services', auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN', 'OPERATOR'), (req, res, next) => serviceController_js_1.serviceController.getAll(req, res, next));
router.get('/services/:id', auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN', 'OPERATOR'), (req, res, next) => serviceController_js_1.serviceController.getById(req, res, next));
router.post('/services', auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN'), (req, res, next) => serviceController_js_1.serviceController.create(req, res, next));
router.put('/services/:id', auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN'), (req, res, next) => serviceController_js_1.serviceController.update(req, res, next));
router.delete('/services/:id', auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN'), (req, res, next) => serviceController_js_1.serviceController.delete(req, res, next));
// ============================================================================
// DEMO OPERATIONS ROUTES (AUTO AUDIT LOG GENERATION)
// Allowed for: ADMIN, OPERATOR (VIEWER gets 403 Forbidden)
// ============================================================================
// Auth Demo
router.post('/demo/auth/login-success', auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN', 'OPERATOR'), (req, res, next) => demoController_js_1.demoController.loginSuccess(req, res, next));
router.post('/demo/auth/login-failed', auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN', 'OPERATOR'), (req, res, next) => demoController_js_1.demoController.loginFailed(req, res, next));
router.post('/demo/auth/logout', auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN', 'OPERATOR'), (req, res, next) => demoController_js_1.demoController.logout(req, res, next));
// User Demo
router.post('/demo/users', auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN', 'OPERATOR'), (req, res, next) => demoController_js_1.demoController.createUser(req, res, next));
router.put('/demo/users/:id', auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN', 'OPERATOR'), (req, res, next) => demoController_js_1.demoController.updateUser(req, res, next));
router.delete('/demo/users/:id', auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN', 'OPERATOR'), (req, res, next) => demoController_js_1.demoController.deleteUser(req, res, next));
// Order Demo
router.post('/demo/orders', auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN', 'OPERATOR'), (req, res, next) => demoController_js_1.demoController.createOrder(req, res, next));
router.put('/demo/orders/:id', auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN', 'OPERATOR'), (req, res, next) => demoController_js_1.demoController.updateOrder(req, res, next));
router.put('/demo/orders/:id/cancel', auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN', 'OPERATOR'), (req, res, next) => demoController_js_1.demoController.cancelOrder(req, res, next));
router.delete('/demo/orders/:id', auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN', 'OPERATOR'), (req, res, next) => demoController_js_1.demoController.deleteOrder(req, res, next));
// Payment Demo
router.post('/demo/payments/success', auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN', 'OPERATOR'), (req, res, next) => demoController_js_1.demoController.paymentSuccess(req, res, next));
router.post('/demo/payments/failed', auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN', 'OPERATOR'), (req, res, next) => demoController_js_1.demoController.paymentFailed(req, res, next));
router.post('/demo/payments/refund', auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN', 'OPERATOR'), (req, res, next) => demoController_js_1.demoController.paymentRefund(req, res, next));
exports.default = router;
