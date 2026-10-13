// src/modules/branches/branches.mapper.js
// Branch row → frontend `Branch` type.

import { num, opt } from '../../lib/dto.js';

/** @param {object} b Branch row; @param {Map<string,string>} [adminNames] userId → name */
export const toBranchDTO = (b, adminNames) => ({
  id:               b.id,
  name:             b.name,
  code:             b.code,
  address:          b.address,
  city:             b.city,
  phone:            b.phone,
  email:            opt(b.email),
  timezone:         b.timezone,
  taxRate:          num(b.taxRate),
  taxEnabled:       b.taxEnabled,
  defaultTaxRuleId: opt(b.defaultTaxRuleId),
  currency:         b.currency,
  openingCashFloat: num(b.openingCashFloat),
  isActive:         b.isActive,
  assignedAdminId:  opt(b.assignedAdminId),
  assignedAdminName: b.assignedAdminId ? adminNames?.get(b.assignedAdminId) : undefined,
  taxRegistrationNumber: opt(b.taxRegistrationNumber),
  taxAuthority:          opt(b.taxAuthority),
});
