import { Request, Response, NextFunction } from 'express';
import { serviceCatalogService } from '../services/serviceCatalogService.js';
import { createServiceSchema, updateServiceSchema } from '../validators/serviceValidator.js';
import { auditLogService } from '../services/auditLogService.js';
import { isValidUuid } from '../validators/auditLogValidator.js';
import { AppError } from '../middleware/errorHandler.js';

export class ServiceController {
  /**
   * GET /api/services - Retrieve all services
   */
  async getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const services = await serviceCatalogService.getAllServices();
      res.status(200).json({
        success: true,
        message: 'Services retrieved successfully',
        data: services,
        count: services.length,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/services/:id - Retrieve single service
   */
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const serviceId = String(req.params.id);
      if (!isValidUuid(serviceId)) {
        throw new AppError(`Invalid UUID format for service_id: '${serviceId}'`, 400);
      }

      const service = await serviceCatalogService.getServiceById(serviceId);
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
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/services - Register a new service
   */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validatedData = createServiceSchema.parse(req.body);
      const created = await serviceCatalogService.createService(validatedData);

      // Auto Audit Log for Service Registration
      try {
        await auditLogService.createLog({
          service_name: 'User',
          level: 'INFO',
          action: 'CREATE_SERVICE',
          message: `Admin registered new service: ${created.service_name}`,
          user_id: 'admin',
          ip_address: req.ip || '127.0.0.1',
          details: { service_id: created.service_id, service_name: created.service_name, status: created.status },
        });
      } catch (logErr) {
        console.warn('[AutoAudit] Could not record audit log for service creation:', logErr);
      }

      res.status(201).json({
        success: true,
        message: 'Service created successfully',
        data: created,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/services/:id - Update service
   */
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const serviceId = String(req.params.id);
      if (!isValidUuid(serviceId)) {
        throw new AppError(`Invalid UUID format for service_id: '${serviceId}'`, 400);
      }

      const validatedData = updateServiceSchema.parse(req.body);
      const updated = await serviceCatalogService.updateService(serviceId, validatedData);

      // Auto Audit Log for Service Update
      try {
        await auditLogService.createLog({
          service_name: 'User',
          level: 'INFO',
          action: 'UPDATE_SERVICE',
          message: `Admin updated service '${updated.service_name}' [ID: ${serviceId}]`,
          user_id: 'admin',
          ip_address: req.ip || '127.0.0.1',
          details: { service_id: updated.service_id, service_name: updated.service_name, status: updated.status },
        });
      } catch (logErr) {
        console.warn('[AutoAudit] Could not record audit log for service update:', logErr);
      }

      res.status(200).json({
        success: true,
        message: 'Service updated successfully',
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/services/:id - Delete service
   */
  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const serviceId = String(req.params.id);
      if (!isValidUuid(serviceId)) {
        throw new AppError(`Invalid UUID format for service_id: '${serviceId}'`, 400);
      }

      // Check existing service name for audit log before delete
      const existing = await serviceCatalogService.getServiceById(serviceId);
      const serviceName = existing?.service_name || serviceId;

      await serviceCatalogService.deleteService(serviceId);

      // Auto Audit Log for Service Deletion
      try {
        await auditLogService.createLog({
          service_name: 'User',
          level: 'WARN',
          action: 'DELETE_SERVICE',
          message: `Admin deleted service '${serviceName}' from catalogue`,
          user_id: 'admin',
          ip_address: req.ip || '127.0.0.1',
          details: { service_id: serviceId, service_name: serviceName },
        });
      } catch (logErr) {
        console.warn('[AutoAudit] Could not record audit log for service deletion:', logErr);
      }

      res.status(200).json({
        success: true,
        message: 'Service deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
}

export const serviceController = new ServiceController();
