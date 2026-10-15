"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = void 0;
exports.authenticate = authenticate;
exports.authorize = authorize;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_js_1 = require("../config/env.js");
const userService_js_1 = require("../services/userService.js");
/**
 * Middleware: Verify JWT Bearer token and active account status
 * HTTP 401 for missing, invalid, expired tokens or inactive accounts
 */
async function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({
            success: false,
            message: 'Unauthorized',
            error: 'Missing or malformed Authorization header. Bearer token required.',
        });
        return;
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, env_js_1.env.JWT_SECRET);
        // Verify account is still active in database
        const dbUser = await userService_js_1.userService.findByUsername(decoded.username);
        if (dbUser && dbUser.status === 'INACTIVE') {
            res.status(401).json({
                success: false,
                message: 'Unauthorized',
                error: 'Account is disabled. Please contact system administrator.',
            });
            return;
        }
        req.user = {
            user_id: dbUser ? dbUser.user_id : decoded.user_id || 'system-user',
            username: decoded.username,
            role: dbUser ? dbUser.role : decoded.role,
            full_name: dbUser?.full_name,
            email: dbUser?.email,
        };
        next();
    }
    catch (error) {
        res.status(401).json({
            success: false,
            message: 'Unauthorized',
            error: error.name === 'TokenExpiredError' ? 'Token expired. Please re-login.' : 'Invalid authentication token.',
        });
    }
}
/**
 * Middleware Factory: Enforce Role-Based Access Control (RBAC)
 * HTTP 403 Forbidden when authenticated user lacks required role
 */
function authorize(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            res.status(401).json({
                success: false,
                message: 'Unauthorized',
                error: 'Authentication required before role authorization check.',
            });
            return;
        }
        if (!allowedRoles.includes(req.user.role)) {
            res.status(403).json({
                success: false,
                message: 'Forbidden',
                error: `Access denied. Role '${req.user.role}' lacks required permissions. Allowed roles: [${allowedRoles.join(', ')}]`,
            });
            return;
        }
        next();
    };
}
// Backwards compatibility alias
exports.requireAuth = authenticate;
