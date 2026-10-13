// scripts/clean-to-single-branch.js
import 'dotenv/config';
import prisma from '../src/config/prisma.js';

const WARSI_BRANCH_ID = '84b4c825-09f5-4163-8464-d497312f9a23';
const KEEP_USER_EMAILS = [
  'huzaifawarsi2006@gmail.com',
  'superadmin@isysware.com',
];

async function cleanDatabase() {
  console.log('🧹 Starting complete data cleanup to 0 for Warsi Salon...');

  // 1. Clear all transactions, refunds, and financial ledgers
  console.log('1. Clearing refunds & payments...');
  await prisma.refundLine.deleteMany({});
  await prisma.invoiceRefund.deleteMany({});
  await prisma.invoiceLineBatch.deleteMany({});
  await prisma.invoiceLineComponent.deleteMany({});
  await prisma.invoiceLine.deleteMany({});
  await prisma.invoicePayment.deleteMany({});
  await prisma.commissionEvent.deleteMany({});
  await prisma.invoice.deleteMany({});

  console.log('2. Clearing appointments...');
  await prisma.appointmentPackageComponent.deleteMany({});
  await prisma.appointmentItem.deleteMany({});
  await prisma.appointmentReschedule.deleteMany({});
  await prisma.appointment.deleteMany({});

  console.log('3. Clearing tips, commission, payroll...');
  await prisma.tipPayout.deleteMany({});
  await prisma.tipAllocation.deleteMany({});
  await prisma.tipReceipt.deleteMany({});
  await prisma.commissionPayment.deleteMany({});
  await prisma.commissionStatement.deleteMany({});
  await prisma.commissionRun.deleteMany({});
  await prisma.payslip.deleteMany({});
  await prisma.payrollPayment.deleteMany({});
  await prisma.payrollRun.deleteMany({});

  console.log('4. Clearing attendance & overtime...');
  await prisma.attendanceCorrection.deleteMany({});
  await prisma.attendancePunch.deleteMany({});
  await prisma.attendanceRecord.deleteMany({});
  await prisma.leaveRecord.deleteMany({});
  await prisma.branchHoliday.deleteMany({});
  await prisma.overtimeRecord.deleteMany({});

  console.log('5. Clearing inventory, stock, purchases, suppliers...');
  await prisma.stockSettlementLine.deleteMany({});
  await prisma.stockSettlement.deleteMany({});
  await prisma.supplierReturnLine.deleteMany({});
  await prisma.supplierReturn.deleteMany({});
  await prisma.purchaseLine.deleteMany({});
  await prisma.purchase.deleteMany({});
  await prisma.supplierPayment.deleteMany({});
  await prisma.supplierLedger.deleteMany({});
  await prisma.supplier.deleteMany({});
  await prisma.stockMovement.deleteMany({});
  await prisma.inventoryBatch.deleteMany({});
  await prisma.inventoryItem.deleteMany({});

  console.log('6. Clearing expenses, settlements, cash custody...');
  await prisma.expense.deleteMany({});
  await prisma.cashVarianceAdjustment.deleteMany({});
  await prisma.settlement.deleteMany({});
  await prisma.cashTransfer.deleteMany({});
  await prisma.drawerMovement.deleteMany({});
  await prisma.accountMovement.deleteMany({});
  await prisma.cashDrawer.deleteMany({});

  console.log('7. Clearing catalogue (services & packages)...');
  await prisma.packageComponent.deleteMany({});
  await prisma.package.deleteMany({});
  await prisma.service.deleteMany({});
  await prisma.serviceCategory.deleteMany({});

  console.log('8. Clearing clients and staff...');
  await prisma.client.deleteMany({});
  await prisma.staffCompensationHistory.deleteMany({});
  await prisma.staff.deleteMany({});

  console.log('9. Clearing tax rules, payment accounts, expense categories...');
  // First clear branch defaultTaxRule references
  await prisma.branch.updateMany({ data: { defaultTaxRuleId: null } });
  await prisma.taxRule.deleteMany({});
  await prisma.paymentAccount.deleteMany({});
  await prisma.expenseCategory.deleteMany({});
  await prisma.payrollPolicy.deleteMany({});

  console.log('10. Clearing audit events, idempotency keys, sequences...');
  await prisma.auditEvent.deleteMany({});
  await prisma.idempotencyKey.deleteMany({});
  await prisma.sequence.deleteMany({});

  console.log('11. Clearing tokens and demo users...');
  await prisma.refreshToken.deleteMany({});
  await prisma.passwordResetToken.deleteMany({});

  // Clear demo branch assigned admin references
  await prisma.branch.updateMany({
    where: { id: { not: WARSI_BRANCH_ID } },
    data: { assignedAdminId: null },
  });

  // Delete all users except Huzaifa and Superadmin
  const deletedUsers = await prisma.user.deleteMany({
    where: { email: { notIn: KEEP_USER_EMAILS } },
  });
  console.log(`Deleted ${deletedUsers.count} demo users. Kept: ${KEEP_USER_EMAILS.join(', ')}`);

  console.log('12. Deleting demo branches (Gulberg & Clifton)...');
  const deletedBranches = await prisma.branch.deleteMany({
    where: { id: { not: WARSI_BRANCH_ID } },
  });
  console.log(`Deleted ${deletedBranches.count} demo branches.`);

  // 13. Initialize clean foundation for Warsi Salon
  console.log('13. Initializing clean foundation for Warsi Salon...');
  const warsi = await prisma.branch.findUnique({ where: { id: WARSI_BRANCH_ID } });
  if (warsi) {
    // Ensure active and code 0001
    await prisma.branch.update({
      where: { id: WARSI_BRANCH_ID },
      data: {
        isActive: true,
        openingCashFloat: 0,
      },
    });

    // Create Main Vault for Warsi Salon (Opening Float 0)
    const vault = await prisma.cashDrawer.create({
      data: {
        kind: 'VAULT',
        branchId: WARSI_BRANCH_ID,
        custodianName: 'Branch Vault (Admin Safe)',
        date: new Date(),
        status: 'OPEN',
        lastCountedCash: 0,
      },
    });

    // Create default essential expense categories for Warsi Salon
    const defaultExpenseCategories = [
      { name: 'Salon Supplies & Products', description: 'Cosmetics, dyes, shampoos, and supplies' },
      { name: 'Utilities & Bills', description: 'Electricity, water, gas, and internet' },
      { name: 'Refreshments & Tea', description: 'Client and staff refreshments' },
      { name: 'Maintenance & Repairs', description: 'Equipment, chairs, and salon repair' },
      { name: 'Rent', description: 'Premises monthly rent' },
      { name: 'General & Miscellaneous', description: 'Day-to-day general salon expenses' },
    ];
    for (const cat of defaultExpenseCategories) {
      await prisma.expenseCategory.create({
        data: {
          branchId: WARSI_BRANCH_ID,
          name: cat.name,
          description: cat.description,
          isActive: true,
        },
      });
    }

    // Create default standard Payment Accounts for Warsi Salon
    await prisma.paymentAccount.create({
      data: {
        branchId: WARSI_BRANCH_ID,
        name: 'Meezan Bank Checking',
        accountType: 'BANK',
        providerName: 'Meezan Bank Ltd',
        accountHolder: 'Warsi Salon',
        accountIdentifier: 'PK36MEZN0001004821',
        openingBalance: 0,
        isActive: true,
      },
    });

    // Create default Tax Rule (13% Sindh Sales Tax / PST - inactive by default until configured)
    const defaultTax = await prisma.taxRule.create({
      data: {
        branchId: WARSI_BRANCH_ID,
        name: 'Standard Services SST/PST',
        rate: 0.13,
        isBranchDefault: true,
        isActive: true,
      },
    });

    await prisma.branch.update({
      where: { id: WARSI_BRANCH_ID },
      data: { defaultTaxRuleId: defaultTax.id },
    });

    console.log('✅ Warsi Salon initialized with clean 0 balances, vault, categories, and accounts.');
  }

  // Set business date to today
  const todayYmd = new Date().toISOString().slice(0, 10);
  await prisma.systemSetting.upsert({
    where: { key: 'BUSINESS_DATE' },
    update: { value: todayYmd },
    create: { key: 'BUSINESS_DATE', value: todayYmd },
  });

  // Verify final state
  console.log('\n📊 FINAL DATABASE VERIFICATION:');
  const [bCount, uCount, invCount, aptCount, clCount, stCount, expCount, drwCount] = await Promise.all([
    prisma.branch.count(),
    prisma.user.count(),
    prisma.invoice.count(),
    prisma.appointment.count(),
    prisma.client.count(),
    prisma.staff.count(),
    prisma.expense.count(),
    prisma.cashDrawer.count(),
  ]);

  console.log(`- Branches: ${bCount} (Warsi Salon)`);
  console.log(`- Users: ${uCount} (Huzaifa & Super Admin)`);
  console.log(`- Invoices: ${invCount}`);
  console.log(`- Appointments: ${aptCount}`);
  console.log(`- Clients: ${clCount}`);
  console.log(`- Staff: ${stCount}`);
  console.log(`- Expenses: ${expCount}`);
  console.log(`- Drawers: ${drwCount}`);
  console.log('\n✨ Database is completely CLEAN & at 0!');
}

cleanDatabase()
  .catch((e) => {
    console.error('❌ Error during cleanup:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
