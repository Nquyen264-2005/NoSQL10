"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateServiceSchema = exports.createServiceSchema = void 0;
const zod_1 = require("zod");
exports.createServiceSchema = zod_1.z.object({
    service_name: zod_1.z
        .string({ required_error: 'service_name is required' })
        .min(2, 'service_name must have at least 2 characters')
        .max(50, 'service_name cannot exceed 50 characters')
        .regex(/^[a-zA-Z0-9_-]+$/, 'service_name must only contain alphanumeric characters, underscores, or hyphens')
        .trim(),
    description: zod_1.z
        .string()
        .max(255, 'description cannot exceed 255 characters')
        .optional()
        .default(''),
    status: zod_1.z.boolean().default(true),
});
exports.updateServiceSchema = zod_1.z.object({
    service_name: zod_1.z
        .string()
        .min(2, 'service_name must have at least 2 characters')
        .max(50, 'service_name cannot exceed 50 characters')
        .regex(/^[a-zA-Z0-9_-]+$/, 'service_name must only contain alphanumeric characters, underscores, or hyphens')
        .trim()
        .optional(),
    description: zod_1.z.string().max(255).optional(),
    status: zod_1.z.boolean().optional(),
});
