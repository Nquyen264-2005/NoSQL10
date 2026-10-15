"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.serviceController = exports.ServiceController = void 0;
const serviceCatalogService_js_1 = require("../services/serviceCatalogService.js");
const serviceValidator_js_1 = require("../validators/serviceValidator.js");
const auditLogService_js_1 = require("../services/auditLogService.js");
const auditLogValidator_js_1 = require("../validators/auditLogValidator.js");
const errorHandler_js_1 = require("../middleware/errorHandler.js");
class ServiceController {
    /**
     * GET /api/services - Retrieve all services
     */
    async getAll(req, res, next) {
        try {
            const services = await serviceCatalogService_js_1.serviceCatalogService.getAllServices();
            res.status(200).json({
                success: true,
                message: 'Services retrieved successfully',
                data: services,
                count: services.length,
            });
        }
        catch (error) {
            next(error);
        }
    }
    /**
     * GET /api/services/:id - Retrieve single service
     */
    async getById(req, res, next) {
        try {
            const serviceId = String(req.params.id);
            if (!(0, auditLogValidator_js_1.isValidUuid)(serviceId)) {
                throw new errorHandler_js_1.AppError(`Invalid UUID format for service_id: '${serviceId}'`, 400);
            }
            const service = await serviceCatalogService_js_1.serviceCatalogService.getServiceById(serviceId);
            if (!service) {
                res.status(404).json({
                    success: false,
                    message: 'Service not found',
                    error: `No service found with ID ${serviceId}`,
                });
                return;
            }
            res.status(200).json({
                success: true,
                message: 'Service retrieved successfully',
                data: service,
            });
        }
        catch (error) {
            next(error);
        }
    }
    /**
     * POST /api/services - Register a new service
     */
    async create(req, res, next) {
        try {
            const validatedData = serviceValidator_js_1.createServiceSchema.parse(req.body);
            const created = await serviceCatalogService_js_1.serviceCatalogService.createService(validatedData);
            // Auto Audit Log for Service Registration
            try {
                await auditLogService_js_1.auditLogService.createLog({
                    service_name: 'User',
                    level: 'INFO',
                    action: 'CREATE_SERVICE',
                    message: `Admin registered new service: ${created.service_name}`,
                    user_id: 'admin',
                    ip_address: req.ip || '127.0.0.1',
                    details: { service_id: created.service_id, service_name: created.service_name, status: created.status },
                });
            }
            catch (logErr) {
                console.warn('[AutoAudit] Could not record audit log for service creation:', logErr);
            }
            res.status(201).json({
                success: true,
                message: 'Service created successfully',
                data: created,
            });
        }
        catch (error) {
            next(error);
        }
    }
    /**
     * PUT /api/services/:id - Update service
     */
    async update(req, res, next) {
        try {
            const serviceId = String(req.params.id);
            if (!(0, auditLogValidator_js_1.isValidUuid)(serviceId)) {
                throw new errorHandler_js_1.AppError(`Invalid UUID format for service_id: '${serviceId}'`, 400);
            }
            const validatedData = serviceValidator_js_1.updateServiceSchema.parse(req.body);
            const updated = await serviceCatalogService_js_1.serviceCatalogService.updateService(serviceId, validatedData);
            // Auto Audit Log for Service Update
            try {
                await auditLogService_js_1.auditLogService.createLog({
                    service_name: 'User',
                    level: 'INFO',
                    action: 'UPDATE_SERVICE',
                    message: `Admin updated service '${updated.service_name}' [ID: ${serviceId}]`,
                    user_id: 'admin',
                    ip_address: req.ip || '127.0.0.1',
                    details: { service_id: updated.service_id, service_name: updated.service_name, status: updated.status },
                });
            }
            catch (logErr) {
                console.warn('[AutoAudit] Could not record audit log for service update:', logErr);
            }
            res.status(200).json({
                success: true,
                message: 'Service updated successfully',
                data: updated,
            });
        }
        catch (error) {
            next(error);
        }
    }
    /**
     * DELETE /api/services/:id - Delete service
     */
    async delete(req, res, next) {
        try {
            const serviceId = String(req.params.id);
            if (!(0, auditLogValidator_js_1.isValidUuid)(serviceId)) {
                throw new errorHandler_js_1.AppError(`Invalid UUID format for service_id: '${serviceId}'`, 400);
            }
            // Check existing service name for audit log before delete
            const existing = await serviceCatalogService_js_1.serviceCatalogService.getServiceById(serviceId);
            const serviceName = existing?.service_name || serviceId;
            await serviceCatalogService_js_1.serviceCatalogService.deleteService(serviceId);
            // Auto Audit Log for Service Deletion
            try {
                await auditLogService_js_1.auditLogService.createLog({
                    service_name: 'User',
                    level: 'WARN',
                    action: 'DELETE_SERVICE',
                    message: `Admin deleted service '${serviceName}' from catalogue`,
                    user_id: 'admin',
                    ip_address: req.ip || '127.0.0.1',
                    details: { service_id: serviceId, service_name: serviceName },
                });
            }
            catch (logErr) {
                console.warn('[AutoAudit] Could not record audit log for service deletion:', logErr);
            }
            res.status(200).json({
                success: true,
                message: 'Service deleted successfully',
            });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.ServiceController = ServiceController;
exports.serviceController = new ServiceController();
