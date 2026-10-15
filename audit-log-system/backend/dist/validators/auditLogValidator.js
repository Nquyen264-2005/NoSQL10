"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.queryLogSchema = exports.createLogSchema = exports.UUID_REGEX = exports.ALLOWED_ACTIONS = exports.ALLOWED_LEVELS = void 0;
exports.isValidUuid = isValidUuid;
const zod_1 = require("zod");
const sensitiveDataFilter_js_1 = require("../utils/sensitiveDataFilter.js");
// Allowed audit levels per specification
exports.ALLOWED_LEVELS = ['INFO', 'WARN', 'ERROR'];
// Allowed actions per service
exports.ALLOWED_ACTIONS = {
    Auth: ['LOGIN', 'LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT', 'RESET_PASSWORD'],
    User: ['CREATE_USER', 'UPDATE_USER', 'DELETE_USER', 'VIEW_USER', 'CREATE_SERVICE', 'UPDATE_SERVICE', 'DELETE_SERVICE'],
    Order: ['CREATE_ORDER', 'UPDATE_ORDER', 'CANCEL_ORDER', 'DELETE_ORDER'],
    Payment: ['CREATE_PAYMENT', 'PAYMENT_SUCCESS', 'PAYMENT_FAILED', 'REFUND'],
};
// UUID v1-v5 validation pattern
exports.UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isValidUuid(id) {
    return exports.UUID_REGEX.test(id);
}
// IPv4 / IPv6 regex
const IP_REGEX = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$|^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^localhost$/;
// Zod schema for log creation
exports.createLogSchema = zod_1.z.object({
    service_name: zod_1.z
        .string({ required_error: 'service_name is required' })
        .min(2, 'service_name must have at least 2 characters')
        .max(50, 'service_name cannot exceed 50 characters')
        .trim(),
    level: zod_1.z.enum(exports.ALLOWED_LEVELS, {
        errorMap: () => ({
            message: "level must be strictly one of: 'INFO', 'WARN', 'ERROR'. DEBUG, HIGH, LOW are rejected.",
        }),
    }),
    action: zod_1.z
        .string({ required_error: 'action is required' })
        .min(2, 'action must have at least 2 characters')
        .max(100, 'action cannot exceed 100 characters')
        .trim(),
    message: zod_1.z
        .string({ required_error: 'message is required' })
        .min(1, 'message cannot be empty')
        .max(2000, 'message cannot exceed 2000 characters')
        .trim(),
    user_id: zod_1.z.string().max(100).optional().nullable(),
    ip_address: zod_1.z
        .string()
        .optional()
        .nullable()
        .refine((ip) => !ip || IP_REGEX.test(ip), { message: 'ip_address must be a valid IPv4 or IPv6 address' }),
    details: zod_1.z.union([zod_1.z.string(), zod_1.z.record(zod_1.z.any())]).optional().nullable(),
    ttl: zod_1.z.number().int().positive().max(31536000).optional().nullable(),
    log_id: zod_1.z.string().refine((id) => !id || isValidUuid(id), { message: 'log_id must be a valid UUID' }).optional().nullable(),
    log_time: zod_1.z.union([zod_1.z.string().datetime(), zod_1.z.date()]).optional().nullable(),
}).superRefine((data, ctx) => {
    // Validate sensitive data in message
    const msgCheck = (0, sensitiveDataFilter_js_1.containsSensitiveData)(data.message);
    if (msgCheck.hasSensitive) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ['message'],
            message: msgCheck.reason || 'Forbidden sensitive data detected in message',
        });
    }
    // Validate sensitive data in details
    const detailsStr = typeof data.details === 'object' ? JSON.stringify(data.details) : data.details;
    const detailsCheck = (0, sensitiveDataFilter_js_1.containsSensitiveData)(detailsStr);
    if (detailsCheck.hasSensitive) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ['details'],
            message: detailsCheck.reason || 'Forbidden sensitive data detected in details',
        });
    }
});
// Zod schema for query filtering
exports.queryLogSchema = zod_1.z.object({
    service: zod_1.z.string().optional(),
    level: zod_1.z.enum(exports.ALLOWED_LEVELS, {
        errorMap: () => ({
            message: "level must be strictly one of: 'INFO', 'WARN', 'ERROR'",
        }),
    }).optional(),
    date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be in YYYY-MM-DD format').optional(),
    start_date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'start_date must be in YYYY-MM-DD format').optional(),
    end_date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'end_date must be in YYYY-MM-DD format').optional(),
    from: zod_1.z.string().optional(), // HH:mm or HH:mm:ss or ISO timestamp
    to: zod_1.z.string().optional(),
    limit: zod_1.z.coerce.number().int().min(1).max(1000).default(100),
    page_state: zod_1.z.string().optional().nullable(),
    cursor: zod_1.z.string().optional().nullable(),
    pageState: zod_1.z.string().optional().nullable(),
}).superRefine((data, ctx) => {
    if (data.from && data.to) {
        // If both are HH:mm or HH:mm:ss
        const isTimeOnly = /^\d{2}:\d{2}(:\d{2})?$/.test(data.from) && /^\d{2}:\d{2}(:\d{2})?$/.test(data.to);
        if (isTimeOnly) {
            if (data.from > data.to) {
                ctx.addIssue({
                    code: zod_1.z.ZodIssueCode.custom,
                    path: ['from'],
                    message: "'from' time cannot be greater than 'to' time",
                });
            }
        }
        else {
            const fromMs = new Date(data.from).getTime();
            const toMs = new Date(data.to).getTime();
            if (!isNaN(fromMs) && !isNaN(toMs) && fromMs > toMs) {
                ctx.addIssue({
                    code: zod_1.z.ZodIssueCode.custom,
                    path: ['from'],
                    message: "'from' time cannot be greater than 'to' time",
                });
            }
        }
    }
});
