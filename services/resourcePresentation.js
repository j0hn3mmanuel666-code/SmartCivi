export const conditionLabels = { good: 'Good', fair: 'Fair', poor: 'Poor', serviceable: 'Serviceable', maintenance: 'Maintenance', unserviceable: 'Unserviceable' };
export const resourceCondition = row => conditionLabels[row.condition] || row.condition;
export const lowStock = row => row.category === 'supply' && row.quantity <= row.minimum;
export const stockLabel = row => lowStock(row) ? 'Low stock' : row.category === 'supply' ? 'Available' : '—';
