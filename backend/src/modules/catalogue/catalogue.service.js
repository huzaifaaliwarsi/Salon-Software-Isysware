// src/modules/catalogue/catalogue.service.js
// Service catalogue, packages (multi-component, weights total 100%) and categories.
// Price/weight edits only affect FUTURE sales — invoices snapshot everything at posting time.

import prisma from '../../config/prisma.js';
import { auditLog } from '../../lib/audit.js';
import { badRequest, conflict, notFound } from '../../lib/AppError.js';
import { assertBranchAccess, resolveReadBranch, resolveWriteBranch } from '../../lib/scope.js';
import { round2, toDec } from '../../lib/money.js';
import { toCategoryDTO, toServiceDTO, toPackageDTO } from './catalogue.mapper.js';

const serviceInclude = { category: true };
const packageInclude = { components: { include: { service: true } } };

const audit = (tx, actor, action, entity, entityId, branchId, before, after) =>
  auditLog(tx, { userId: actor.id, userName: actor.name, action, entity, entityId, branchId, before, after });

const assertActiveBranch = async (tx, branchId) => {
  const branch = await tx.branch.findUnique({ where: { id: branchId } });
  if (!branch || !branch.isActive) throw badRequest('BRANCH_INACTIVE', `Branch '${branchId}' is invalid or deactivated.`);
};

const assertTaxRule = async (tx, branchId, taxTreatment, ruleId) => {
  if (taxTreatment !== 'SPECIFIC_RULE') return null;
  if (!ruleId) throw badRequest('TAX_RULE_REQUIRED', 'A specific tax rule must be selected when Tax Treatment is set to Specific Rule.');
  const rule = await tx.taxRule.findFirst({ where: { id: ruleId, branchId } });
  if (!rule) throw badRequest('TAX_RULE_NOT_FOUND', 'Selected specific tax rule does not exist in this branch.');
  if (!rule.isActive) throw badRequest('TAX_RULE_INACTIVE', `Selected tax rule '${rule.name}' is currently deactivated.`);
  return ruleId;
};

/** The UI sends a category NAME; reuse the branch category or create it. */
const categoryIdFor = async (tx, branchId, name) => {
  const clean = (name || 'General').trim();
  const existing = await tx.serviceCategory.findFirst({ where: { branchId, name: { equals: clean, mode: 'insensitive' } } });
  if (existing) {
    if (!existing.isActive) await tx.serviceCategory.update({ where: { id: existing.id }, data: { isActive: true } });
    return existing.id;
  }
  return (await tx.serviceCategory.create({ data: { branchId, name: clean } })).id;
};

// ═══ CATEGORIES ═══════════════════════════════════════════════════════════════

export const listCategories = async (actor, branchId) => {
  const b = resolveReadBranch(actor, branchId);
  const cats = await prisma.serviceCategory.findMany({ where: { ...(b ? { branchId: b } : {}), isActive: true }, orderBy: { name: 'asc' } });
  return cats.map(toCategoryDTO);
};

export const createCategory = async ({ branchId: requested, name }, actor) => {
  const branchId = resolveWriteBranch(actor, requested, 'Access Denied: Cannot manage categories of another branch.');
  return prisma.$transaction(async (tx) => {
    const existing = await tx.serviceCategory.findFirst({ where: { branchId, name: { equals: name, mode: 'insensitive' } } });
    if (existing) {
      if (existing.isActive) throw conflict('CATEGORY_EXISTS', `Category '${name}' already exists.`);
      return toCategoryDTO(await tx.serviceCategory.update({ where: { id: existing.id }, data: { isActive: true } }));
    }
    const cat = await tx.serviceCategory.create({ data: { branchId, name } });
    await audit(tx, actor, 'SERVICE_CATEGORY_CREATED', 'ServiceCategory', cat.id, branchId, null, cat);
    return toCategoryDTO(cat);
  });
};

// ═══ SERVICES ═════════════════════════════════════════════════════════════════

export const listServices = async (actor, branchId) => {
  const b = resolveReadBranch(actor, branchId);
  const services = await prisma.service.findMany({ where: b ? { branchId: b } : {}, include: serviceInclude, orderBy: { code: 'asc' } });
  return services.map(toServiceDTO);
};

export const getService = async (actor, id) => {
  const s = await prisma.service.findUnique({ where: { id }, include: serviceInclude });
  if (!s) return null;
  assertBranchAccess(actor, s.branchId, 'Access Denied: Cannot view service from another branch.');
  return toServiceDTO(s);
};

const generateNextServiceCode = async (tx) => {
  const services = await tx.service.findMany({ select: { code: true } });
  let maxNum = 0;
  const existing = new Set(services.map((s) => (s.code || '').trim().toUpperCase()));
  for (const s of services) {
    if (!s.code) continue;
    const m = s.code.match(/(\d+)$/);
    if (m) {
      const val = parseInt(m[1], 10);
      if (!isNaN(val) && val > maxNum) maxNum = val;
    }
  }
  let nextNum = maxNum + 1;
  let candidate = `SRV-${String(nextNum).padStart(2, '0')}`;
  while (existing.has(candidate)) {
    nextNum++;
    candidate = `SRV-${String(nextNum).padStart(2, '0')}`;
  }
  return candidate;
};

const assertServiceCodeFree = async (tx, branchId, code, exceptId) => {
  const clash = await tx.service.findFirst({
    where: { branchId, code: { equals: code, mode: 'insensitive' }, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
  });
  if (clash) throw conflict('SERVICE_CODE_TAKEN', `Service code '${code}' is already registered in this branch.`);
};

export const createService = async (input, actor) => {
  const branchId = resolveWriteBranch(actor, input.branchId, 'Access Denied: Cannot create services for another branch.');
  return prisma.$transaction(async (tx) => {
    await assertActiveBranch(tx, branchId);
    const code = input.code ? input.code.trim().toUpperCase() : await generateNextServiceCode(tx);
    await assertServiceCodeFree(tx, branchId, code);
    const specificTaxRuleId = await assertTaxRule(tx, branchId, input.taxTreatment, input.specificTaxRuleId);

    const s = await tx.service.create({
      data: {
        branchId,
        categoryId:      await categoryIdFor(tx, branchId, input.category),
        code,
        name:            input.name,
        description:     input.description || null,
        durationMinutes: input.durationMinutes,
        price:           round2(input.price),
        taxTreatment:    input.taxTreatment,
        specificTaxRuleId,
        isActive:        input.isActive ?? true,
      },
      include: serviceInclude,
    });
    await audit(tx, actor, 'SERVICE_CREATED', 'Service', s.id, branchId, null, s);
    return toServiceDTO(s);
  });
};

export const updateService = async (id, input, actor) => {
  return prisma.$transaction(async (tx) => {
    const before = await tx.service.findUnique({ where: { id }, include: serviceInclude });
    if (!before) throw notFound('SERVICE_NOT_FOUND', `Service '${id}' not found.`);
    assertBranchAccess(actor, before.branchId, 'Access Denied: Cannot edit service from another branch.');
    await assertActiveBranch(tx, before.branchId);

    if (input.code) await assertServiceCodeFree(tx, before.branchId, input.code, id);
    const taxTreatment = input.taxTreatment ?? before.taxTreatment;
    const ruleId = input.specificTaxRuleId !== undefined ? input.specificTaxRuleId : before.specificTaxRuleId;
    const specificTaxRuleId = await assertTaxRule(tx, before.branchId, taxTreatment, ruleId);

    const data = { taxTreatment, specificTaxRuleId };
    for (const f of ['code', 'name', 'durationMinutes']) if (input[f] !== undefined) data[f] = input[f];
    if (input.price !== undefined) data.price = round2(input.price);
    if (input.description !== undefined) data.description = input.description || null;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (input.category) data.categoryId = await categoryIdFor(tx, before.branchId, input.category);

    const s = await tx.service.update({ where: { id }, data, include: serviceInclude });
    await audit(tx, actor, 'SERVICE_UPDATED', 'Service', id, s.branchId, before, s);
    return toServiceDTO(s);
  });
};

export const toggleService = async (id, actor) => {
  const s = await prisma.service.findUnique({ where: { id } });
  if (!s) throw notFound('SERVICE_NOT_FOUND', `Service '${id}' not found.`);
  return updateService(id, { isActive: !s.isActive }, actor);
};

// ═══ PACKAGES ═════════════════════════════════════════════════════════════════

/** Validates components (same branch, active services, weights total exactly 100%). */
const validateComponents = async (tx, branchId, components) => {
  const services = await tx.service.findMany({ where: { id: { in: components.map((c) => c.serviceId) } } });
  for (const c of components) {
    const srv = services.find((s) => s.id === c.serviceId);
    if (!srv) throw badRequest('COMPONENT_NOT_FOUND', `Component service '${c.serviceName || c.serviceId}' not found.`);
    if (srv.branchId !== branchId) throw badRequest('COMPONENT_BRANCH', `Component service '${srv.name}' belongs to a different branch.`);
    if (!srv.isActive) throw badRequest('COMPONENT_INACTIVE', `Cannot include deactivated service '${srv.name}' in package.`);
  }
  const hasAllocations = components.some((c) => c.allocationPercentage !== undefined && c.allocationPercentage !== null);
  if (hasAllocations) {
    const total = components.reduce((sum, c) => sum.plus(round2(c.allocationPercentage || 0)), toDec(0));
    if (!total.equals(100)) {
      throw badRequest('ALLOCATION_NOT_100', `Component allocation percentages must total exactly 100% (currently ${total.toNumber()}%).`);
    }
  }
};

const generateNextPackageCode = async (tx) => {
  const packages = await tx.package.findMany({ select: { code: true } });
  let maxNum = 0;
  const existing = new Set(packages.map((p) => (p.code || '').trim().toUpperCase()));
  for (const p of packages) {
    if (!p.code) continue;
    const m = p.code.match(/(\d+)$/);
    if (m) {
      const val = parseInt(m[1], 10);
      if (!isNaN(val) && val > maxNum) maxNum = val;
    }
  }
  let nextNum = maxNum + 1;
  let candidate = `PKG-${String(nextNum).padStart(2, '0')}`;
  while (existing.has(candidate)) {
    nextNum++;
    candidate = `PKG-${String(nextNum).padStart(2, '0')}`;
  }
  return candidate;
};

const assertPackageCodeFree = async (tx, branchId, code, exceptId) => {
  const clash = await tx.package.findFirst({
    where: { branchId, code: { equals: code, mode: 'insensitive' }, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
  });
  if (clash) throw conflict('PACKAGE_CODE_TAKEN', `Package code '${code}' is already registered in this branch.`);
};

const componentRows = (components) => {
  const n = components.length;
  const hasValid = components.every((c) => c.allocationPercentage !== undefined && c.allocationPercentage !== null);
  const sumValid = hasValid ? components.reduce((s, c) => s.plus(round2(c.allocationPercentage)), toDec(0)) : toDec(0);
  const useSupplied = hasValid && sumValid.equals(100);

  const base = n > 0 ? toDec(Math.floor((100 / n) * 100) / 100) : toDec(0);
  let accumulated = toDec(0);

  return components.map((c, i) => {
    let alloc;
    if (useSupplied) {
      alloc = round2(c.allocationPercentage);
    } else if (i === n - 1) {
      alloc = round2(toDec(100).minus(accumulated));
    } else {
      alloc = base;
      accumulated = accumulated.plus(base);
    }
    return {
      serviceId: c.serviceId,
      quantity: c.quantity ?? 1,
      allocationPercentage: alloc,
      sortOrder: i,
    };
  });
};

export const listPackages = async (actor, branchId) => {
  const b = resolveReadBranch(actor, branchId);
  const pkgs = await prisma.package.findMany({ where: b ? { branchId: b } : {}, include: packageInclude, orderBy: { code: 'asc' } });
  return pkgs.map(toPackageDTO);
};

export const getPackage = async (actor, id) => {
  const p = await prisma.package.findUnique({ where: { id }, include: packageInclude });
  if (!p) return null;
  assertBranchAccess(actor, p.branchId, 'Access Denied: Cannot view package from another branch.');
  return toPackageDTO(p);
};

export const createPackage = async (input, actor) => {
  const branchId = resolveWriteBranch(actor, input.branchId, 'Access Denied: Cannot create packages for another branch.');
  return prisma.$transaction(async (tx) => {
    await assertActiveBranch(tx, branchId);
    const code = input.code ? input.code.trim().toUpperCase() : await generateNextPackageCode(tx);
    await assertPackageCodeFree(tx, branchId, code);
    await validateComponents(tx, branchId, input.components);
    const specificTaxRuleId = await assertTaxRule(tx, branchId, input.taxTreatment, input.specificTaxRuleId);

    const p = await tx.package.create({
      data: {
        branchId,
        code,
        name:         input.name,
        description:  input.description || null,
        price:        round2(input.price),
        taxTreatment: input.taxTreatment,
        specificTaxRuleId,
        isActive:     input.isActive ?? true,
        components:   { create: componentRows(input.components) },
      },
      include: packageInclude,
    });
    await audit(tx, actor, 'PACKAGE_CREATED', 'Package', p.id, branchId, null, p);
    return toPackageDTO(p);
  });
};

export const updatePackage = async (id, input, actor) => {
  return prisma.$transaction(async (tx) => {
    const before = await tx.package.findUnique({ where: { id }, include: packageInclude });
    if (!before) throw notFound('PACKAGE_NOT_FOUND', `Package '${id}' not found.`);
    assertBranchAccess(actor, before.branchId, 'Access Denied: Cannot edit package from another branch.');
    await assertActiveBranch(tx, before.branchId);

    if (input.code) await assertPackageCodeFree(tx, before.branchId, input.code, id);
    const taxTreatment = input.taxTreatment ?? before.taxTreatment;
    const ruleId = input.specificTaxRuleId !== undefined ? input.specificTaxRuleId : before.specificTaxRuleId;
    const specificTaxRuleId = await assertTaxRule(tx, before.branchId, taxTreatment, ruleId);

    const isActive = input.isActive ?? before.isActive;
    const components = input.components ?? before.components.map((c) => ({
      serviceId: c.serviceId, quantity: c.quantity, allocationPercentage: toDec(c.allocationPercentage).toNumber(),
    }));
    // Active packages must always be sellable (valid, active components totalling 100%).
    if (input.components || (isActive && !before.isActive)) await validateComponents(tx, before.branchId, components);

    const data = { taxTreatment, specificTaxRuleId, isActive };
    for (const f of ['code', 'name']) if (input[f] !== undefined) data[f] = input[f];
    if (input.price !== undefined) data.price = round2(input.price);
    if (input.description !== undefined) data.description = input.description || null;
    if (input.components) {
      await tx.packageComponent.deleteMany({ where: { packageId: id } });
      data.components = { create: componentRows(input.components) };
    }

    const p = await tx.package.update({ where: { id }, data, include: packageInclude });
    await audit(tx, actor, 'PACKAGE_UPDATED', 'Package', id, p.branchId, before, p);
    return toPackageDTO(p);
  });
};

export const togglePackage = async (id, actor) => {
  const p = await prisma.package.findUnique({ where: { id } });
  if (!p) throw notFound('PACKAGE_NOT_FOUND', `Package '${id}' not found.`);
  return updatePackage(id, { isActive: !p.isActive }, actor);
};
