"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
// Discover .env from multiple candidate locations
const candidateEnvPaths = [
    path_1.default.resolve(process.cwd(), '.env'),
    path_1.default.resolve(process.cwd(), 'backend', '.env'),
    path_1.default.resolve(process.cwd(), '..', '.env'),
];
if (typeof __dirname !== 'undefined') {
    candidateEnvPaths.push(path_1.default.resolve(__dirname, '../../.env'), path_1.default.resolve(__dirname, '../.env'));
}
let loadedEnv = false;
for (const envPath of candidateEnvPaths) {
    if (fs_1.default.existsSync(envPath)) {
        dotenv_1.default.config({ path: envPath });
        loadedEnv = true;
        break;
    }
}
if (!loadedEnv) {
    dotenv_1.default.config();
}
exports.env = {
    PORT: parseInt(process.env.PORT || '5000', 10),
    NODE_ENV: process.env.NODE_ENV || 'development',
    CASSANDRA_CONTACT_POINTS: (process.env.CASSANDRA_CONTACT_POINTS || '127.0.0.1')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    CASSANDRA_PORT: parseInt(process.env.CASSANDRA_PORT || '9042', 10),
    CASSANDRA_LOCAL_DATA_CENTER: process.env.CASSANDRA_LOCAL_DATA_CENTER || 'datacenter1',
    CASSANDRA_KEYSPACE: process.env.CASSANDRA_KEYSPACE || 'audit_log_system',
    ADMIN_USERNAME: process.env.ADMIN_USERNAME || 'admin',
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'admin123',
    JWT_SECRET: (() => {
        const secret = process.env.JWT_SECRET;
        if (!secret && process.env.NODE_ENV === 'production') {
            throw new Error('FATAL SECURITY ERROR: JWT_SECRET environment variable is missing in production.');
        }
        return secret || 'super_secret_audit_log_jwt_key_2026';
    })(),
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h',
    FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
};
