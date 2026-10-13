// src/modules/catalogue/catalogue.schema.js

import { z } from 'zod';

const taxTreatment = z.enum(['BRANCH_DEFAULT', 'SPECIFIC_RULE', 'EXEMPT']);
const price = (label) => z.number({ message: `${label} must be a finite non-negative number.` })
  .finite(`${label} must be a finite non-negative number.`)
  .min(0, `${label} must be a finite non-negative number.`);

export const branchQuery = z.object({ branchId: z.string().optional() }).passthrough();

const serviceFields = {
  code:              z.string().trim().optional().transform((s) => (s ? s.toUpperCase() : undefined)),
  name:              z.string().trim().min(1, 'Service name is required.'),
  category:          z.string().trim().min(1).default('General'),
  durationMinutes:   z.number({ message: 'Duration must be a positive number of minutes.' }).positive('Duration must be a positive number of minutes.').transform(Math.round).optional().default(30),
  price:             price('Selling price'),
  description:       z.string().trim().optional(),
  taxTreatment:      taxTreatment.default('BRANCH_DEFAULT'),
  specificTaxRuleId: z.string().nullable().optional(),
  isActive:          z.boolean().optional(),
};

export const createServiceSchema = z.object({ ...serviceFields, branchId: z.string().optional() }).passthrough();

export const updateServiceSchema = z.object({
  code:              serviceFields.code.optional(),
  name:              serviceFields.name.optional(),
  category:          z.string().trim().min(1).optional(),
  durationMinutes:   serviceFields.durationMinutes.optional(),
  price:             serviceFields.price.optional(),
  description:       z.string().trim().nullable().optional(),
  taxTreatment:      taxTreatment.optional(),
  specificTaxRuleId: z.string().nullable().optional(),
  isActive:          z.boolean().optional(),
}).passthrough();

const component = z.object({
  serviceId:            z.string().min(1),
  quantity:             z.number().int('Component quantity must be a positive whole number.').positive('Component quantity must be a positive whole number.').default(1),
  allocationPercentage: z.number().min(0, 'Allocation percentage must be between 0% and 100%.').max(100, 'Allocation percentage must be between 0% and 100%.').optional(),
}).passthrough(); // serviceCode/serviceName/unitPrice from the UI are ignored — always read from the catalogue

const packageFields = {
  code:              z.string().trim().optional().transform((s) => (s ? s.toUpperCase() : undefined)),
  name:              z.string().trim().min(1, 'Package name is required.'),
  description:       z.string().trim().optional(),
  price:             price('Package selling price'),
  components:        z.array(component).min(1, 'Package must include at least one component service.'),
  taxTreatment:      taxTreatment.default('BRANCH_DEFAULT'),
  specificTaxRuleId: z.string().nullable().optional(),
  isActive:          z.boolean().optional(),
};

export const createPackageSchema = z.object({ ...packageFields, branchId: z.string().optional() }).passthrough();

export const updatePackageSchema = z.object({
  code:              packageFields.code.optional(),
  name:              packageFields.name.optional(),
  description:       z.string().trim().nullable().optional(),
  price:             packageFields.price.optional(),
  components:        packageFields.components.optional(),
  taxTreatment:      taxTreatment.optional(),
  specificTaxRuleId: z.string().nullable().optional(),
  isActive:          z.boolean().optional(),
}).passthrough();

export const createCategorySchema = z.object({
  branchId: z.string().optional(),
  name:     z.string().trim().min(1, 'Category name cannot be empty.'),
});
