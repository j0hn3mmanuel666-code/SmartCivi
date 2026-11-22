import { DataTypes as D } from 'sequelize';
import { sequelize } from './db.js';

export const BudgetItem = sequelize.define('BudgetItem', {
  department: { type: D.STRING(150), allowNull: false },
  item: { type: D.STRING(255), allowNull: false },
  fiscalYear: { type: D.INTEGER, allowNull: false },
  allocated: { type: D.DECIMAL(15, 2), allowNull: false },
  spent: { type: D.DECIMAL(15, 2), allowNull: false, defaultValue: '0.00' },
  archivedAt: D.DATE,
}, { tableName: 'budget_items', indexes: [{ fields: ['fiscalYear', 'department'] }] });
