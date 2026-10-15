"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppError = void 0;
exports.errorHandler = errorHandler;
const zod_1 = require("zod");
const cassandra_driver_1 = __importDefault(require("cassandra-driver"));
class AppError extends Error {
    statusCode;
    details;
    constructor(message, statusCode = 500, details) {
        super(message);
        this.name = 'AppError';
        this.statusCode = statusCode;
        this.details = details;
    }
}
exports.AppError = AppError;
function errorHandler(err, req, res, next) {
    // 1. Zod Validation Errors -> 400 Bad Request
    if (err instanceof zod_1.ZodError) {
        const errorDetails = err.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
        }));
        res.status(400).json({
            success: false,
            message: 'Validation failed',
            error: errorDetails[0]?.message || 'Invalid input data',
            details: errorDetails,
        });
        return;
    }
    // 2. Invalid UUID errors -> 400 Bad Request
    if (err instanceof TypeError && err.message?.includes('valid uuid')) {
        res.status(400).json({
            success: false,
            message: 'Invalid UUID format',
            error: err.message,
        });
        return;
    }
    // 3. Cassandra Connection / Network / Timeout Errors -> 503 Service Unavailable
    const isCassandraConnectionError = err instanceof cassandra_driver_1.default.errors.NoHostAvailableError ||
        err instanceof cassandra_driver_1.default.errors.OperationTimedOutError ||
        err.name === 'NoHostAvailableError' ||
        err.name === 'OperationTimedOutError' ||
        err.name === 'BusyConnectionError' ||
        err.message?.includes('No host could be accessed') ||
        err.message?.includes('All host(s) tried for query failed') ||
        err.message?.includes('Connection was closed') ||
        err.message?.includes('Socket was closed') ||
        err.message?.includes('ECONNREFUSED');
    if (isCassandraConnectionError) {
        console.error('[Database Unavailable]:', err.message);
        res.status(503).json({
            success: false,
            message: 'Database temporarily unavailable',
            error: 'Cannot establish connection to Apache Cassandra cluster',
        });
        return;
    }
    // 4. Known Application Errors (AppError)
    if (err instanceof AppError) {
        res.status(err.statusCode).json({
            success: false,
            message: err.message,
            error: err.details || err.message,
        });
        return;
    }
    // 5. Default Internal Server Error -> 500
    console.error('[Unhandled Server Error]:', err);
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: err.message || 'An unexpected error occurred',
    });
}
